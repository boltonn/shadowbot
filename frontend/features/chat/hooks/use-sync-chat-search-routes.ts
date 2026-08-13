"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useMapStore } from "@/features/map/store";
import type { RouteSearchMatch } from "@/features/routing/types";

function isRouteSearchMatches(value: unknown): value is RouteSearchMatch[] {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && "route" in item);
}

/** Plots every matching candidate from a finished search_routes chat tool call onto the map. */
export function useSyncChatSearchRoutesToMap(messages: UIMessage[]) {
  const processedToolCallIds = useRef(new Set<string>());
  const setMatchedRoutes = useMapStore((state) => state.setMatchedRoutes);

  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool" || part.state !== "output-available") continue;
        if (part.toolName !== "search_routes" || processedToolCallIds.current.has(part.toolCallId)) continue;
        processedToolCallIds.current.add(part.toolCallId);
        if (isRouteSearchMatches(part.output)) setMatchedRoutes(part.output);
      }
    }
  }, [messages, setMatchedRoutes]);
}
