"use client";

import { ActivityRail, VIEWS, type ViewId } from "@/components/activity-rail";
import { ResizableSidebar } from "@/components/resizable-sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatPanel } from "@/features/chat/components/chat-panel";
import { GeodataPanel } from "@/features/geodata/components/geodata-panel";
import { FindLocationPanel } from "@/features/location/components/find-location-panel";
import { MapView } from "@/features/map/components/map-view";
import { RoutePlannerPanel } from "@/features/routing/components/route-planner-panel";
import { cn } from "@/lib/utils";
import { useState } from "react";

export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("chat");
  const [headerActionsEl, setHeaderActionsEl] = useState<HTMLDivElement | null>(
    null,
  );
  const activeViewMeta = VIEWS.find((view) => view.id === activeView);
  const ActiveIcon = activeViewMeta?.icon;

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <ActivityRail active={activeView} onChange={setActiveView} />
        <ResizableSidebar>
          {/* Matches the rail's logo band height (activity-rail.tsx) so the two top bands align. */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            {ActiveIcon && <ActiveIcon className="size-4 text-signal" />}
            <span className="font-mono text-xs font-medium tracking-[0.2em] text-foreground uppercase">
              {activeViewMeta?.label}
            </span>
            {/* Per-view header actions (e.g. clear chat) portal into this slot so they sit
                next to the view title, the spot users expect an action-on-this-view to live. */}
            <div
              ref={setHeaderActionsEl}
              className="ml-auto flex items-center gap-1"
            />
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                activeView !== "chat" && "hidden",
              )}
            >
              <ChatPanel
                headerActionsEl={activeView === "chat" ? headerActionsEl : null}
              />
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                activeView !== "data" && "hidden",
              )}
            >
              <GeodataPanel />
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                activeView !== "routing" && "hidden",
              )}
            >
              <RoutePlannerPanel />
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto",
                activeView !== "location" && "hidden",
              )}
            >
              <FindLocationPanel />
            </div>
          </div>
        </ResizableSidebar>
        <div className="relative flex-1">
          <MapView />
        </div>
      </div>
    </TooltipProvider>
  );
}
