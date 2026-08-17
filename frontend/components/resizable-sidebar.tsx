"use client";

import { useEffect, useRef, useState } from "react";

const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 384;
const STORAGE_KEY = "shadowbot:sidebar-width";

function clamp(value: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

export function ResizableSidebar({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (stored) setWidth(clamp(stored));
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Measured from the sidebar's own left edge rather than the window edge, so this
    // works regardless of what's to its left (activity rail, nothing, etc).
    const left = asideRef.current?.getBoundingClientRect().left ?? 0;

    function handleMove(moveEvent: PointerEvent) {
      setWidth(clamp(moveEvent.clientX - left));
    }
    function handleUp() {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setWidth((current) => {
        window.localStorage.setItem(STORAGE_KEY, String(current));
        return current;
      });
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return (
    <aside
      ref={asideRef}
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-card"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize, double-click to reset"
        onPointerDown={handlePointerDown}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        className="absolute inset-y-0 right-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize touch-none hover:bg-signal/50 active:bg-signal"
      />
      {children}
    </aside>
  );
}
