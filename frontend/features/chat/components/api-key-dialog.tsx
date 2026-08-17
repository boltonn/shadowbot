"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useApiKeyStore } from "@/features/chat/api-key-store";
import { useModelSelector } from "@/features/chat/hooks/use-model-selector";

// Whether a server-configured key is in play for the selected model is only surfaced in
// dev — in production this would leak the operator's server configuration to any client.
const IS_DEV = process.env.NODE_ENV !== "production";

export function ApiKeyDialog({ className }: { className?: string }) {
  const apiKey = useApiKeyStore((state) => state.apiKey);
  const setApiKey = useApiKeyStore((state) => state.setApiKey);
  const open = useApiKeyStore((state) => state.dialogOpen);
  const setOpen = useApiKeyStore((state) => state.setDialogOpen);
  const { model } = useModelSelector();
  const [draft, setDraft] = useState(apiKey);
  const usingServerKey = IS_DEV && !apiKey && !!model?.hasKey;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(apiKey);
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              aria-label="LLM API key"
              className={cn(
                "flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                className,
              )}
              onClick={() => setOpen(true)}
            />
          }
        >
          <KeyRound className={cn("size-5", (apiKey || usingServerKey) && "text-signal")} />
        </TooltipTrigger>
        <TooltipContent side="right">LLM API key</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>LLM API key</DialogTitle>
          <DialogDescription>
            {model ? (
              <>
                Applies to the currently selected model,{" "}
                <span className="font-medium text-foreground">{model.label}</span>.{" "}
              </>
            ) : null}
            Stored only in this browser tab&apos;s session storage and sent with each chat
            request. Leave blank to use the server&apos;s configured key, if any.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="api-key-input" className="text-xs font-normal text-muted-foreground">
            API key
          </Label>
          <Input
            id="api-key-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={usingServerKey ? "Server key configured (dev)" : "Provider API key"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose
            render={<Button type="button" variant="outline" />}
            onClick={() => setDraft(apiKey)}
          >
            Cancel
          </DialogClose>
          <DialogClose
            render={<Button type="button" />}
            onClick={() => setApiKey(draft.trim())}
          >
            Save
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
