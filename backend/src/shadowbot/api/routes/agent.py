"""SSE chat endpoint bridging the Shadowbot agent to the frontend.

Emits the Vercel AI SDK's UI Message Stream Protocol directly (bare
`data: <json>\\n\\n` chunks matching `UIMessageChunk`, terminated with
`data: [DONE]\\n\\n`) so the frontend can drive its chat UI with
`useChat` from `@ai-sdk/react` with no custom parsing — including its
built-in tool-call rendering and tool-approval-request/response flow,
which pydantic-ai's DeferredToolRequestsEvent feeds directly.

Every tool call and result is streamed as its own chunk, not just the
final answer, so the UI can show what the agent is doing as it happens
(e.g. "geocoding 'nearby park'") rather than only the end result.
"""

import asyncio
import json
from collections.abc import AsyncIterable
from functools import lru_cache
from typing import Any
from uuid import uuid4

from fastapi import APIRouter
from loguru import logger
from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    AgentStreamEvent,
    DeferredToolRequestsEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    PartDeltaEvent,
    PartEndEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ThinkingPart,
    ThinkingPartDelta,
)
from pydantic_core import to_jsonable_python
from sse_starlette.sse import EventSourceResponse

from shadowbot.agent.core import build_agent
from shadowbot.agent.tools import AgentDeps
from shadowbot.api.deps.area_features import AreaFeatureDatastoreDep
from shadowbot.api.deps.poi import PoiDatastoreDep
from shadowbot.api.deps.postgres import (
    ChatDatastoreDep,
    LocationLabelDatastoreDep,
    PointDatasetDatastoreDep,
    PolygonDatasetDatastoreDep,
    RouteDatastoreDep,
    TrackDatastoreDep,
)
from shadowbot.api.deps.routing import RoutingDatastoreDep
from shadowbot.api.settings import Settings
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.chat import AgentConfig, ChatRequest

router = APIRouter(prefix="/agent", tags=["agent"])
settings = Settings()

UI_MESSAGE_STREAM_HEADERS = {
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "x-vercel-ai-ui-message-stream": "v1",
    "x-accel-buffering": "no",
}


@lru_cache(maxsize=1)
def get_default_agent() -> Agent[AgentDeps, str]:
    """Build the server-configured agent lazily so app startup doesn't require an LLM API key."""
    return build_agent(settings.llm)


def get_agent(api_key: str | None) -> Agent[AgentDeps, str]:
    """Build an agent for this request, overriding the API key if the client supplied one."""
    if not api_key:
        return get_default_agent()
    return build_agent(settings.llm.model_copy(update={"api_key": api_key}))


def has_server_llm_key() -> bool:
    """Whether the server can build its default agent without a client-supplied API key.

    Building the underlying provider client raises immediately if it has no key to
    authenticate with (from settings or the provider's own env var), so attempting the
    same lazy build used for real requests doubles as a config check with no network call.
    """
    try:
        get_default_agent()
        return True
    except Exception:  # noqa: BLE001 — any build failure means no usable server key
        return False


@router.get("/config")
def get_agent_config() -> AgentConfig:
    """Whether the frontend can skip prompting for an API key up front."""
    return AgentConfig(has_server_key=has_server_llm_key())


@lru_cache(maxsize=1)
def get_nominatim_client() -> NominatimClient:
    return NominatimClient(config=settings.nominatim)


class _UIMessageStreamTranslator:
    """Translates pydantic-ai stream events into AI SDK UIMessageChunks.

    Stateful only to bracket text/thinking parts with their -start/-end chunks,
    which the protocol requires but pydantic-ai's PartStartEvent/PartEndEvent
    index doesn't map to 1:1 without tracking which indices are which kind.
    """

    def __init__(self) -> None:
        self._open_text_ids: dict[int, str] = {}
        self._open_thinking_ids: dict[int, str] = {}

    def translate(self, event: AgentStreamEvent) -> list[dict[str, Any]]:
        match event:
            case PartStartEvent(index=index, part=TextPart(content=content)):
                part_id = str(uuid4())
                self._open_text_ids[index] = part_id
                chunks = [{"type": "text-start", "id": part_id}]
                if content:
                    chunks.append(
                        {"type": "text-delta", "id": part_id, "delta": content}
                    )
                return chunks
            case PartStartEvent(index=index, part=ThinkingPart(content=content)):
                part_id = str(uuid4())
                self._open_thinking_ids[index] = part_id
                chunks = [{"type": "reasoning-start", "id": part_id}]
                if content:
                    chunks.append(
                        {"type": "reasoning-delta", "id": part_id, "delta": content}
                    )
                return chunks
            case PartDeltaEvent(
                index=index, delta=TextPartDelta(content_delta=content_delta)
            ):
                part_id = self._open_text_ids.get(index)
                if part_id is None:
                    return []
                return [{"type": "text-delta", "id": part_id, "delta": content_delta}]
            case PartDeltaEvent(
                index=index, delta=ThinkingPartDelta(content_delta=content_delta)
            ):
                part_id = self._open_thinking_ids.get(index)
                if part_id is None or content_delta is None:
                    return []
                return [{"type": "reasoning-delta", "id": part_id, "delta": content_delta}]
            case PartEndEvent(index=index):
                if (part_id := self._open_text_ids.pop(index, None)) is not None:
                    return [{"type": "text-end", "id": part_id}]
                if (part_id := self._open_thinking_ids.pop(index, None)) is not None:
                    return [{"type": "reasoning-end", "id": part_id}]
                return []
            case FunctionToolCallEvent(part=part):
                return [
                    {
                        "type": "tool-input-available",
                        "toolCallId": part.tool_call_id,
                        "toolName": part.tool_name,
                        "input": part.args,
                        # Tools aren't statically known to the frontend (they're defined entirely
                        # on the pydantic-ai side), so they must render as the AI SDK's "dynamic
                        # tool" part (type: dynamic-tool) rather than a static tool-<name> part —
                        # without this flag the chunk is accepted but silently renders as a part
                        # type the UI never checks for.
                        "dynamic": True,
                    }
                ]
            case FunctionToolResultEvent(part=part):
                return [
                    {
                        "type": "tool-output-available",
                        "toolCallId": part.tool_call_id,
                        # part.content is the tool's raw Python return value (often Pydantic
                        # models), not JSON — serialize it with camelCase aliases to match the
                        # schemas' CamelModel convention before it hits the wire.
                        "output": to_jsonable_python(part.content, by_alias=True),
                    }
                ]
            case DeferredToolRequestsEvent(requests=requests):
                return [
                    {
                        "type": "tool-approval-request",
                        "approvalId": call.tool_call_id,
                        "toolCallId": call.tool_call_id,
                    }
                    for call in requests.approvals
                ]
            case _:
                return []


@router.post("/chat")
async def chat(
    request: ChatRequest,
    chat_repository: ChatDatastoreDep,
    routing: RoutingDatastoreDep,
    routes: RouteDatastoreDep,
    tracks: TrackDatastoreDep,
    poi: PoiDatastoreDep,
    areas: AreaFeatureDatastoreDep,
    point_datasets: PointDatasetDatastoreDep,
    polygon_datasets: PolygonDatasetDatastoreDep,
    location_labels: LocationLabelDatastoreDep,
) -> EventSourceResponse:
    """Stream an agent turn as an AI SDK UI Message Stream."""
    session = await chat_repository.get_or_create_session(request.session_id)
    message_history = await chat_repository.get_message_history(session.id)
    deps = AgentDeps(
        geocoder=get_nominatim_client(),
        routing=routing,
        routes=routes,
        tracks=tracks,
        poi=poi,
        areas=areas,
        polygon_datasets=polygon_datasets,
        point_datasets=point_datasets,
        location_labels=location_labels,
    )

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
    translator = _UIMessageStreamTranslator()

    async def event_stream_handler(
        ctx: RunContext[AgentDeps], events: AsyncIterable[AgentStreamEvent]
    ) -> None:
        async for event in events:
            for chunk in translator.translate(event):
                await queue.put(chunk)

    async def run_agent() -> None:
        message_id = str(uuid4())
        await queue.put({"type": "start", "messageId": message_id})
        await queue.put({"type": "start-step"})
        try:
            result = await get_agent(request.api_key).run(
                request.message,
                message_history=message_history,
                deps=deps,
                event_stream_handler=event_stream_handler,
            )
            await chat_repository.save_message_history(
                session.id, result.all_messages()
            )
            await queue.put({"type": "finish-step"})
            await queue.put({"type": "finish", "finishReason": "stop"})
        except Exception as exc:  # noqa: BLE001 — surface any run failure to the client stream
            logger.exception("Agent run failed")
            await queue.put({"type": "error", "errorText": str(exc)})
        finally:
            await queue.put(None)

    async def event_generator() -> AsyncIterable[dict[str, Any]]:
        task = asyncio.create_task(run_agent())
        try:
            while (chunk := await queue.get()) is not None:
                yield {"data": json.dumps(chunk, default=str)}
            yield {"data": "[DONE]"}
        finally:
            await task

    return EventSourceResponse(event_generator(), headers=UI_MESSAGE_STREAM_HEADERS)
