"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Check, CornerDownLeft, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadarSweep } from "@/components/ui/radar-sweep";
import { apiBaseUrl } from "@/lib/api-client";
import { ApiKeyDialog } from "@/features/chat/components/api-key-dialog";
import { useApiKey } from "@/features/chat/hooks/use-api-key";
import { useSyncChatLocationsToMap } from "@/features/chat/hooks/use-sync-chat-locations";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";

function isAuthError(message: string) {
  return /api[_ ]?key|authenticat/i.test(message);
}

export function ChatPanel() {
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36),
  );
  const [input, setInput] = useState("");
  const [showTrace, setShowTrace] = useState(true);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const { apiKey, setApiKey } = useApiKey();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${apiBaseUrl}/agent/chat`,
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          const text =
            lastMessage?.parts
              ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
              .map((part) => part.text)
              .join("") ?? "";
          return {
            body: { message: text, sessionId: sessionIdRef.current, apiKey: apiKey || undefined },
          };
        },
      }),
    [apiKey],
  );

  const { messages, sendMessage, status, error, clearError, addToolApprovalResponse } = useChat({
    transport,
  });
  useSyncChatLocationsToMap(messages);

  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const lastMessageHasText = lastMessage?.parts.some(
    (part) => part.type === "text" && part.text.length > 0,
  );
  const showThinkingIndicator =
    isBusy && !(status === "streaming" && lastMessageHasText);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isBusy) return;
    clearError();
    sendMessage({ text });
    setInput("");
  };

  useEffect(() => {
    if (error && isAuthError(error.message)) {
      setApiKeyDialogOpen(true);
    }
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <Label htmlFor="show-trace" className="text-xs font-normal text-muted-foreground">
          Show tool calls
        </Label>
        <div className="flex items-center gap-3">
          <Switch id="show-trace" checked={showTrace} onCheckedChange={setShowTrace} />
          <ApiKeyDialog
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            open={apiKeyDialogOpen}
            onOpenChange={setApiKeyDialogOpen}
          />
        </div>
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
                    return <MessageResponse key={index}>{part.text}</MessageResponse>;
                  }
                  if (part.type === "reasoning") {
                    return (
                      <Reasoning key={index} isStreaming={part.state === "streaming"}>
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
                            Approval needed: {part.toolName}({JSON.stringify(part.input)})
                          </span>
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-none"
                              onClick={() =>
                                addToolApprovalResponse({ id: part.approval.id, approved: true })
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
                                addToolApprovalResponse({ id: part.approval.id, approved: false })
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
                        <ToolHeader type="dynamic-tool" toolName={part.toolName} state={part.state} />
                        <ToolContent>
                          <ToolInput input={"input" in part ? part.input : undefined} />
                          <ToolOutput
                            output={"output" in part ? part.output : undefined}
                            errorText={"errorText" in part ? part.errorText : undefined}
                          />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
              </Message>
            </div>
          ))}
          {showThinkingIndicator && <RadarSweep theme="dark" size={20} />}
          {error && (
            <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="break-words whitespace-pre-wrap">{error.message}</span>
                {isAuthError(error.message) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-fit rounded-none"
                    onClick={() => setApiKeyDialogOpen(true)}
                  >
                    Set API key
                  </Button>
                )}
              </div>
            </div>
          )}
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
        <Button
          type="button"
          size="icon"
          className="rounded-none"
          disabled={isBusy || !input.trim()}
          onClick={handleSend}
        >
          <CornerDownLeft className="size-4" />
        </Button>
      </div>
    </div>
  );
}
