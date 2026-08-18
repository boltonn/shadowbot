"use client";

import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { RadarSweep } from "@/components/ui/radar-sweep";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApiKeyStore } from "@/features/chat/api-key-store";
import { useModelSelector } from "@/features/chat/hooks/use-model-selector";
import { describeToolCall } from "@/features/chat/lib/tool-descriptions";
import { useSyncChatLocationsToMap } from "@/features/chat/hooks/use-sync-chat-locations";
import { useSyncChatRouteToMap } from "@/features/chat/hooks/use-sync-chat-route";
import { useSyncChatSearchRoutesToMap } from "@/features/chat/hooks/use-sync-chat-search-routes";
import { useMapStore } from "@/features/map/store";
import { apiBaseUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Check,
  ChevronDownIcon,
  CornerDownLeft,
  Square,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

function isAuthError(message: string) {
  return /api[_ ]?key|authenticat/i.test(message);
}

// Matches the backend's TRACE_MARKER in api/routes/agent.py — splits a message's short summary
// from extra detail appended after it (a full traceback, or a retry's response body), so the
// detail can render collapsed rather than always being shown inline.
const TRACE_MARKER = "---TRACEBACK---";

function splitErrorTrace(message: string): { summary: string; trace?: string } {
  const index = message.indexOf(TRACE_MARKER);
  if (index === -1) return { summary: message };
  return {
    summary: message.slice(0, index).trim(),
    trace: message.slice(index + TRACE_MARKER.length).trim(),
  };
}

const LOG_LEVEL_STYLES: Record<string, string> = {
  WARNING: "text-amber-500",
  ERROR: "text-destructive",
  CRITICAL: "text-destructive",
};

interface LogData {
  level: string;
  message: string;
}

function isLogData(data: unknown): data is LogData {
  return (
    typeof data === "object" &&
    data !== null &&
    "level" in data &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  );
}

export function ChatPanel({
  headerActionsEl,
}: {
  headerActionsEl: HTMLDivElement | null;
}) {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [showTrace, setShowTrace] = useState(true);
  const apiKey = useApiKeyStore((state) => state.apiKey);
  const openApiKeyDialog = useApiKeyStore((state) => state.openDialog);
  const { model, modelId } = useModelSelector();
  const [lastPromptedModelId, setLastPromptedModelId] = useState<
    string | undefined
  >(undefined);
  const [lastHandledError, setLastHandledError] = useState<Error | undefined>(
    undefined,
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBaseUrl}/agent/chat`,
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          const text =
            lastMessage?.parts
              ?.filter(
                (part): part is { type: "text"; text: string } =>
                  part.type === "text",
              )
              .map((part) => part.text)
              .join("") ?? "";
          return {
            body: {
              message: text,
              sessionId,
              apiKey: apiKey || undefined,
              modelId,
            },
          };
        },
      }),
    [apiKey, modelId, sessionId],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    clearError,
    addToolApprovalResponse,
    stop,
    setMessages,
  } = useChat({ transport });
  useSyncChatLocationsToMap(messages);
  useSyncChatRouteToMap(messages);
  useSyncChatSearchRoutesToMap(messages);

  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const lastMessageHasText = lastMessage?.parts.some(
    (part) => part.type === "text" && part.text.length > 0,
  );
  const showThinkingIndicator =
    isBusy && !(status === "streaming" && lastMessageHasText);

  // The last tool call that hasn't resolved yet, if any — gives the map HUD something more
  // useful to show than a bare spinner while a slow tool call (or a stalled LLM request) is
  // in flight and the map itself has no other way to indicate that.
  const activeToolPart = [...(lastMessage?.parts ?? [])]
    .reverse()
    .find(
      (part): part is Extract<typeof part, { type: "dynamic-tool" }> =>
        part.type === "dynamic-tool" &&
        part.state !== "output-available" &&
        part.state !== "output-error",
    );
  const agentBusyLabel = activeToolPart
    ? `Running ${activeToolPart.toolName}…`
    : isBusy
      ? "Thinking…"
      : null;

  // Mirrors isBusy/agentBusyLabel into the map store so MapHud — a sibling of this panel, not
  // a descendant — can show it too; computed during render rather than in an Effect, same as
  // the error-handling sync below.
  const [lastSyncedBusy, setLastSyncedBusy] = useState<{
    busy: boolean;
    label: string | null;
  }>({ busy: false, label: null });
  if (isBusy !== lastSyncedBusy.busy || agentBusyLabel !== lastSyncedBusy.label) {
    setLastSyncedBusy({ busy: isBusy, label: agentBusyLabel });
    useMapStore.getState().setAgentBusy(isBusy, agentBusyLabel);
  }

  const handleSend = () => {
    const text = input.trim();
    if (!text || isBusy) return;
    clearError();
    sendMessage({ text });
    setInput("");
  };

  const handleClear = () => {
    stop();
    setMessages([]);
    clearError();
    setSessionId(crypto.randomUUID());
    useMapStore.getState().setActiveRoute(null);
    useMapStore.getState().clearMatchedRoutes();
    useMapStore.getState().applyChatLocationsUpdate("replace", [], []);
  };

  // Adjusting state in response to a prop/hook-state change, computed during render rather
  // than in an Effect — see https://react.dev/learn/you-might-not-need-an-effect.
  if (error !== lastHandledError) {
    setLastHandledError(error);
    if (error && isAuthError(error.message)) {
      openApiKeyDialog();
    }
  }

  // Prompt for a key up front rather than waiting for the first request to fail, if the
  // selected model has no server-side key and the user hasn't supplied one. Re-checked
  // whenever the selected model changes — a server key for one provider doesn't cover
  // every model in the picker (e.g. an Anthropic key doesn't authenticate Gemini).
  if (modelId && modelId !== lastPromptedModelId) {
    setLastPromptedModelId(modelId);
    if (!apiKey && model && !model.hasKey) {
      openApiKeyDialog();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {headerActionsEl &&
        createPortal(
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 rounded-none text-muted-foreground hover:text-destructive"
            disabled={messages.length === 0 && !isBusy}
            onClick={handleClear}
            title="Clear chat"
          >
            <Trash2 className="size-3.5" />
          </Button>,
          headerActionsEl,
        )}

      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <Label
          htmlFor="show-trace"
          className="text-xs font-normal text-muted-foreground"
        >
          Show tool calls
        </Label>
        <Switch
          id="show-trace"
          checked={showTrace}
          onCheckedChange={setShowTrace}
        />
      </div>

      <Conversation>
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              title="Ask Shadowbot"
              description="Ask for a route, or ask what a location in your uploaded tracks might be."
            />
          )}
          {messages.map((message) => (
            <div key={message.id} className="flex w-full items-start gap-2">
              {message.role !== "user" && (
                <Image
                  src="/chat-icon.png"
                  alt="Shadowbot"
                  width={24}
                  height={24}
                  className="size-6 shrink-0 rounded-full ring-1 ring-signal/40"
                />
              )}
              <Message from={message.role}>
                <MessageContent>
                  <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {message.role === "user" ? "You" : "Shadowbot"}
                  </span>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={index}>
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    if (part.type === "reasoning") {
                      return (
                        <Reasoning
                          key={index}
                          isStreaming={part.state === "streaming"}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    }
                    if (part.type === "dynamic-tool") {
                      if (part.state === "approval-requested") {
                        return (
                          <div
                            key={index}
                            className="flex flex-col gap-2 border border-signal/40 bg-signal/10 px-2.5 py-2"
                          >
                            <span className="font-mono text-[11px]">
                              Approval needed: {part.toolName}(
                              {JSON.stringify(part.input)})
                            </span>
                            <div className="flex gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="rounded-none"
                                onClick={() =>
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: true,
                                  })
                                }
                              >
                                <Check className="size-3.5" />
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="rounded-none"
                                onClick={() =>
                                  addToolApprovalResponse({
                                    id: part.approval.id,
                                    approved: false,
                                  })
                                }
                              >
                                <X className="size-3.5" />
                                Deny
                              </Button>
                            </div>
                          </div>
                        );
                      }
                      if (!showTrace) return null;
                      return (
                        <Tool key={index}>
                          <ToolHeader
                            type="dynamic-tool"
                            toolName={part.toolName}
                            state={part.state}
                            title={describeToolCall(
                              part.toolName,
                              "input" in part ? part.input : undefined,
                            )}
                          />
                          <ToolContent>
                            <ToolInput
                              input={"input" in part ? part.input : undefined}
                            />
                            <ToolOutput
                              output={
                                "output" in part ? part.output : undefined
                              }
                              errorText={
                                "errorText" in part ? part.errorText : undefined
                              }
                            />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    if (part.type === "data-log" && isLogData(part.data)) {
                      const { summary, trace: detail } = splitErrorTrace(
                        part.data.message,
                      );
                      return (
                        <div
                          key={part.id ?? index}
                          className={cn(
                            "font-mono text-[11px] leading-relaxed",
                            LOG_LEVEL_STYLES[part.data.level] ??
                              "text-muted-foreground",
                          )}
                        >
                          <span className="whitespace-pre-wrap">
                            {summary}
                          </span>
                          {detail && (
                            <Collapsible className="group mt-1">
                              <CollapsibleTrigger className="flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100">
                                Show details
                                <ChevronDownIcon className="size-3 transition-transform group-data-[state=open]:rotate-180" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-1">
                                <CodeBlock
                                  code={detail}
                                  language="console"
                                  className="text-[10px]"
                                />
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            </div>
          ))}
          {showThinkingIndicator && <RadarSweep theme="dark" size={20} />}
          {error &&
            (() => {
              const { summary, trace } = splitErrorTrace(error.message);
              return (
                <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-sm text-destructive">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words whitespace-pre-wrap">
                      {summary}
                    </span>
                    {isAuthError(summary) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit rounded-none"
                        onClick={openApiKeyDialog}
                      >
                        Set API key
                      </Button>
                    )}
                    {trace && (
                      <Collapsible className="group">
                        <CollapsibleTrigger className="flex w-fit items-center gap-1 text-xs text-destructive/80 hover:text-destructive">
                          Show trace
                          <ChevronDownIcon className="size-3 transition-transform group-data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1.5">
                          <CodeBlock
                            code={trace}
                            language="console"
                            className="text-xs"
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </div>
              );
            })()}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex shrink-0 gap-2 border-t border-border p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask Shadowbot..."
          className="min-h-10 rounded-none"
        />
        {isBusy ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="rounded-none"
            onClick={stop}
            title="Stop"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="rounded-none"
            disabled={!input.trim()}
            onClick={handleSend}
          >
            <CornerDownLeft className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
