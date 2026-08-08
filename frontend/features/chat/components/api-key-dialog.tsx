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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ApiKeyDialog({
  apiKey,
  onApiKeyChange,
  open,
  onOpenChange,
}: {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState(apiKey);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(apiKey);
        onOpenChange?.(next);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Set LLM API key"
          />
        }
      >
        <KeyRound className={cn("size-3.5", apiKey ? "text-signal" : "text-muted-foreground")} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>LLM API key</DialogTitle>
          <DialogDescription>
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
            placeholder="Provider API key"
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
            onClick={() => onApiKeyChange(draft.trim())}
          >
            Save
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
