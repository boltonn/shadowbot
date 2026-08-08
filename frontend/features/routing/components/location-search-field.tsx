"use client";

import { useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useGeocodeSearch } from "@/features/routing/hooks/use-geocode-search";
import type { GeocodeResult } from "@/features/routing/types";

type LocationSearchFieldProps = {
  label: string;
  value: GeocodeResult | null;
  onChange: (result: GeocodeResult | null) => void;
};

export function LocationSearchField({ label, value, onChange }: LocationSearchFieldProps) {
  const [query, setQuery] = useState("");
  const geocodeSearch = useGeocodeSearch();

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {label}
        </span>
        <div className="flex items-center gap-2 rounded-lg border border-input bg-input/30 py-1 pr-1.5 pl-2.5">
          <MapPin className="size-3.5 shrink-0 text-signal" strokeWidth={2.5} />
          <span className="flex-1 truncate text-sm">{value.displayName}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Clear ${label}`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1">
      <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
        {label}
      </span>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) geocodeSearch.mutate(query.trim());
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place..."
          className="pl-8"
        />
        {geocodeSearch.isPending && (
          <Loader2 className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </form>
      {geocodeSearch.data && geocodeSearch.data.length > 0 && (
        <ul
          className={cn(
            "absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
            "animate-in fade-in-0 zoom-in-95 duration-150 ease-out",
          )}
        >
          {geocodeSearch.data.map((result, index) => (
            <li key={`${result.displayName}-${index}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(result);
                  geocodeSearch.reset();
                }}
                className="flex w-full items-center gap-2 truncate rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{result.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {geocodeSearch.isError && (
        <p className="text-xs text-destructive">Couldn&apos;t search that. Try again.</p>
      )}
    </div>
  );
}
