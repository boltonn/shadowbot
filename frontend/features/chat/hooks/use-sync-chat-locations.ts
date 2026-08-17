"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useMapStore } from "@/features/map/store";
import { extractMapLocationsUpdate, isMapLocationsUpdateTool } from "@/features/chat/lib/tool-locations";

/** Applies the agent's update_map_locations tool calls to the map's chat-location layer. */
export function useSyncChatLocationsToMap(messages: UIMessage[]) {
  const processedToolCallIds = useRef(new Set<string>());
  const applyChatLocationsUpdate = useMapStore((state) => state.applyChatLocationsUpdate);

  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool" || part.state !== "output-available") continue;
        if (!isMapLocationsUpdateTool(part.toolName) || processedToolCallIds.current.has(part.toolCallId)) continue;
        processedToolCallIds.current.add(part.toolCallId);
        const update = extractMapLocationsUpdate(part.toolName, part.output);
        if (update) applyChatLocationsUpdate(update.action, update.locations, update.removeIds);
      }
    }
  }, [messages, applyChatLocationsUpdate]);
}
