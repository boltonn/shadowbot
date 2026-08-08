"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useMapStore } from "@/features/map/store";
import type { ChatLocation } from "@/features/map/types";
import { extractChatLocations, isLocationTool } from "@/features/chat/lib/tool-locations";

/** Plots locations from finished chat tool calls (geocode, POI search, etc.) onto the map. */
export function useSyncChatLocationsToMap(messages: UIMessage[]) {
  const processedToolCallIds = useRef(new Set<string>());
  const addChatLocations = useMapStore((state) => state.addChatLocations);

  useEffect(() => {
    const newLocations: ChatLocation[] = [];
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool" || part.state !== "output-available") continue;
        if (!isLocationTool(part.toolName) || processedToolCallIds.current.has(part.toolCallId)) continue;
        processedToolCallIds.current.add(part.toolCallId);
        newLocations.push(...extractChatLocations(part.toolName, part.toolCallId, part.output));
      }
    }
    if (newLocations.length > 0) addChatLocations(newLocations);
  }, [messages, addChatLocations]);
}
