"use client";

import { Check, Layers } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MAP_STYLE_OPTIONS, useMapStyleStore } from "@/features/map/style-store";

export function StyleSwitcher({ className }: { className?: string }) {
  const styleId = useMapStyleStore((state) => state.styleId);
  const setStyleId = useMapStyleStore((state) => state.setStyleId);

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
              aria-label="Tile style"
            />
          }
        >
          <Layers className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="right">Tile style</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-48">
        <span className="block px-2 py-1 font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          Tile style
        </span>
        <ul className="flex flex-col">
          {MAP_STYLE_OPTIONS.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => setStyleId(option.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {option.label}
                {option.id === styleId && <Check className="size-3.5 text-signal" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
