"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Collapsible raw OSM tag/link disclosure — shared by chat-plotted locations and area matches. */
export function RawPropertiesDisclosure({ properties }: { properties: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const { url, ...rest } = properties;
  const keys = Object.keys(rest);
  if (!url && keys.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-signal underline underline-offset-2"
        >
          View raw OSM element
        </a>
      )}
      {keys.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
            Raw data ({keys.length})
          </button>
          {open && (
            <dl className="grid max-h-40 grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 overflow-auto rounded-sm border border-border bg-muted/20 p-1.5 text-[10px]">
              {keys.map((key) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-muted-foreground">{key}</dt>
                  <dd className="truncate">{rest[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}
