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
import contextlib
import json
import traceback
from collections.abc import AsyncIterable
from functools import lru_cache
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from fastapi import APIRouter
from loguru import logger

if TYPE_CHECKING:
    from loguru import Message
from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import ModelHTTPError
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
from shadowbot.agent.provider import AVAILABLE_MODELS, build_model, resolve_llm_settings
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
from shadowbot.api.deps.routing import RoutingCoverageDep, RoutingDatastoreDep
from shadowbot.api.settings import Settings
from shadowbot.integrations.nominatim import NominatimClient
from shadowbot.schemas.chat import AgentConfig, ChatRequest, ModelOption

SERVER_DEFAULT_MODEL_ID = "server-default"

router = APIRouter(prefix="/agent", tags=["agent"])
settings = Settings()

UI_MESSAGE_STREAM_HEADERS = {
    "cache-control": "no-cache",
    "connection": "keep-alive",
    "x-vercel-ai-ui-message-stream": "v1",
    "x-accel-buffering": "no",
}

# Appended after the exception message in an "error" chunk's errorText, ahead of the full
# traceback — the frontend splits on this to show a short message with the trace collapsed.
TRACE_MARKER = "---TRACEBACK---"

# Transient model-provider failures worth waiting out rather than failing the turn:
# rate limits (429) and momentary overload (503/529, the latter Anthropic-specific).
RETRYABLE_MODEL_STATUS_CODES = {429, 503, 529}
MAX_MODEL_RETRIES = 2
DEFAULT_MODEL_RETRY_SECONDS = 5.0
MAX_MODEL_RETRY_SECONDS = 60.0


def _make_log_sink(
    loop: asyncio.AbstractEventLoop, queue: asyncio.Queue[dict[str, Any] | None], request_id: str
) -> Any:
    """A loguru sink that forwards this request's log records into the SSE stream.

    Runs from whatever thread emits the log (tool calls like graph fetching run via
    asyncio.to_thread), so the queue put must be scheduled back onto the event loop rather
    than called directly.
    """

    def sink(message: "Message") -> None:
        record = message.record
        chunk = {
            "type": "data-log",
            "id": str(uuid4()),
            "data": {"level": record["level"].name, "message": record["message"]},
        }
        loop.call_soon_threadsafe(queue.put_nowait, chunk)

    return sink


@lru_cache(maxsize=1)
def get_default_agent() -> Agent[AgentDeps, str]:
    """Build the server-configured agent lazily so app startup doesn't require an LLM API key."""
    return build_agent(settings.llm)


def get_agent(api_key: str | None, model_id: str | None) -> Agent[AgentDeps, str]:
    """Build an agent for this request, overriding the API key and/or model if supplied."""
    if not api_key and (not model_id or model_id == SERVER_DEFAULT_MODEL_ID):
        return get_default_agent()
    llm_settings = resolve_llm_settings(
        settings.llm, None if model_id == SERVER_DEFAULT_MODEL_ID else model_id
    )
    if api_key:
        llm_settings = llm_settings.model_copy(update={"api_key": api_key})
    return build_agent(llm_settings)


def _model_has_key(model_id: str) -> bool:
    """Whether the server can authenticate this model without a client-supplied key.

    A single LLM__API_KEY may only be valid for one provider, so this checks each model's
    own resolved settings rather than assuming the server default's key applies everywhere.
    Building the underlying provider client raises immediately if it has no key to
    authenticate with (from settings or the provider's own env var), so attempting the
    build doubles as a config check with no network call.
    """
    try:
        build_model(resolve_llm_settings(settings.llm, model_id))
        return True
    except Exception:  # noqa: BLE001 — any build failure means no usable key for this model
        return False


def _model_options() -> tuple[list[ModelOption], str]:
    """The frontend's selectable model list, plus which id is the server's current default."""
    options = [
        ModelOption(id=m.id, provider=m.provider, label=m.label, has_key=_model_has_key(m.id))
        for m in AVAILABLE_MODELS
    ]
    matched = next(
        (m for m in AVAILABLE_MODELS if m.provider == settings.llm.provider and m.model == settings.llm.model),
        None,
    )
    if matched is not None:
        return options, matched.id
    server_default = ModelOption(
        id=SERVER_DEFAULT_MODEL_ID,
        provider=settings.llm.provider,
        label=f"Server default ({settings.llm.model})",
        has_key=has_server_llm_key(),
    )
    return [server_default, *options], SERVER_DEFAULT_MODEL_ID


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
    """Whether the frontend can skip prompting for an API key up front, and the model picker's options."""
    models, default_model_id = _model_options()
    return AgentConfig(has_server_key=has_server_llm_key(), models=models, default_model_id=default_model_id)


@lru_cache(maxsize=1)
def get_nominatim_client() -> NominatimClient:
    return NominatimClient(config=settings.nominatim, osm_website_url=settings.osm_website_url)


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
    routing_coverage: RoutingCoverageDep,
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
        coverage=routing_coverage,
        github_repo=settings.github_repo,
    )

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
    translator = _UIMessageStreamTranslator()
    loop = asyncio.get_running_loop()

    async def event_stream_handler(
        ctx: RunContext[AgentDeps], events: AsyncIterable[AgentStreamEvent]
    ) -> None:
        async for event in events:
            for chunk in translator.translate(event):
                await queue.put(chunk)

    async def run_agent() -> None:
        request_id = str(uuid4())
        await queue.put({"type": "start", "messageId": request_id})
        await queue.put({"type": "start-step"})
        log_handler_id = logger.add(
            _make_log_sink(loop, queue, request_id),
            level="INFO",
            filter=lambda record: record["extra"].get("request_id") == request_id,
            format="{message}",
        )
        try:
            with logger.contextualize(request_id=request_id):
                agent = get_agent(request.api_key, request.model_id)
                attempt = 0
                while True:
                    try:
                        result = await agent.run(
                            request.message,
                            message_history=message_history,
                            deps=deps,
                            event_stream_handler=event_stream_handler,
                        )
                        break
                    except ModelHTTPError as exc:
                        # A retry re-runs the whole turn from scratch (agent.run gives no way to
                        # resume a partially-completed tool-calling loop), so this only helps when
                        # the failure happens on the first model call — the common case for a 429
                        # hit right at the start of a turn.
                        if exc.status_code not in RETRYABLE_MODEL_STATUS_CODES or attempt >= MAX_MODEL_RETRIES:
                            raise
                        attempt += 1
                        wait_seconds = min(exc.retry_after or DEFAULT_MODEL_RETRY_SECONDS, MAX_MODEL_RETRY_SECONDS)
                        logger.warning(
                            f"Model provider returned {exc.status_code}; retrying in "
                            f"{wait_seconds:.0f}s (attempt {attempt}/{MAX_MODEL_RETRIES})"
                        )
                        await asyncio.sleep(wait_seconds)
            await chat_repository.save_message_history(
                session.id, result.all_messages()
            )
            await queue.put({"type": "finish-step"})
            await queue.put({"type": "finish", "finishReason": "stop"})
        except Exception as exc:  # noqa: BLE001 — surface any run failure to the client stream
            logger.exception("Agent run failed")
            error_text = f"{exc}\n\n{TRACE_MARKER}\n{traceback.format_exc()}"
            await queue.put({"type": "error", "errorText": error_text})
        finally:
            logger.remove(log_handler_id)
            await queue.put(None)

    async def event_generator() -> AsyncIterable[dict[str, Any]]:
        task = asyncio.create_task(run_agent())
        try:
            while (chunk := await queue.get()) is not None:
                yield {"data": json.dumps(chunk, default=str)}
            yield {"data": "[DONE]"}
        finally:
            # If the client disconnects (e.g. the frontend's stop button aborts the
            # fetch), this generator is cancelled here — cancel the agent run too so an
            # interrupted turn actually stops calling the LLM instead of finishing
            # unattended in the background.
            if not task.done():
                task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    return EventSourceResponse(event_generator(), headers=UI_MESSAGE_STREAM_HEADERS)
