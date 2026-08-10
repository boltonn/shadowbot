"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useMapStore } from "@/features/map/store";
import type { Route } from "@/features/routing/types";

const ROUTE_TOOL_NAMES = new Set(["plan_route", "reroute"]);

function isRoute(value: unknown): value is Route {
  return typeof value === "object" && value !== null && "id" in value && "geometry" in value;
}

/** Plots the route from a finished plan_route/reroute chat tool call onto the map. */
export function useSyncChatRouteToMap(messages: UIMessage[]) {
  const processedToolCallIds = useRef(new Set<string>());
  const setActiveRoute = useMapStore((state) => state.setActiveRoute);

  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool" || part.state !== "output-available") continue;
        if (!ROUTE_TOOL_NAMES.has(part.toolName) || processedToolCallIds.current.has(part.toolCallId)) continue;
        processedToolCallIds.current.add(part.toolCallId);
        if (isRoute(part.output)) setActiveRoute(part.output);
      }
    }
  }, [messages, setActiveRoute]);
}
