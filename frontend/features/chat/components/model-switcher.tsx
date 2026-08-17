"use client";

import { Check, Cpu } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useModelSelector } from "@/features/chat/hooks/use-model-selector";

export function ModelSwitcher({ className }: { className?: string }) {
  const { models, modelId, setModelId } = useModelSelector();

  if (models.length === 0) return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              className={cn(
                "flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                className,
              )}
              aria-label="Model"
            />
          }
        >
          <Cpu className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="right">Model</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-56">
        <span className="block px-2 py-1 font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          Model
        </span>
        <ul className="flex flex-col">
          {models.map((model) => (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => setModelId(model.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {model.label}
                {model.id === modelId && <Check className="size-3.5 text-signal" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
