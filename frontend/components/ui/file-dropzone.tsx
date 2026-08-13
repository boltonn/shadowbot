"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

export const GEOJSON_ACCEPT = ".geojson,.json,application/geo+json,application/json";

export const TABULAR_ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const POINT_UPLOAD_ACCEPT = `${GEOJSON_ACCEPT},${TABULAR_ACCEPT}`;

type FileDropzoneProps = {
  file: File | null;
  onSelect: (file: File | null) => void;
  accept?: string;
  placeholder?: string;
  className?: string;
};

export function FileDropzone({
  file,
  onSelect,
  accept = GEOJSON_ACCEPT,
  placeholder = "Drop a GeoJSON file, or click to browse",
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onSelect(dropped);
        }}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-left transition-colors",
          isDragging ? "border-ring bg-accent/60" : "border-input hover:border-ring hover:bg-accent/40",
          className,
        )}
      >
        <FileUp className="size-4 shrink-0 text-foreground/70" />
        <span className={cn("flex-1 truncate text-sm", file ? "text-foreground" : "text-muted-foreground")}>
          {file ? file.name : placeholder}
        </span>
      </button>
    </div>
  );
}
