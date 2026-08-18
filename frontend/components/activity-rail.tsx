"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, MapPin, MessageSquare, Route as RouteIcon, Shapes, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiKeyDialog } from "@/features/chat/components/api-key-dialog";
import { ModelSwitcher } from "@/features/chat/components/model-switcher";
import { CoverageDialog } from "@/features/coverage/components/coverage-dialog";
import { StyleSwitcher } from "@/features/map/components/style-switcher";
import { cn } from "@/lib/utils";

export type ViewId = "chat" | "data" | "routing" | "location";

export const VIEWS: { id: ViewId; label: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "data", label: "Data", icon: Shapes },
  { id: "routing", label: "Route planner", icon: RouteIcon },
  { id: "location", label: "Find location", icon: MapPin },
];

function RailButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-signal/15 text-signal"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          />
        }
      >
        <Icon className="size-5" />
        {active && <span className="absolute inset-y-2 -left-2.5 w-0.5 rounded-full bg-signal" />}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ActivityRail({
  active,
  onChange,
}: {
  active: ViewId;
  onChange: (view: ViewId) => void;
}) {
  return (
    <nav className="flex w-16 shrink-0 flex-col border-r border-border bg-card">
      {/* Matches the sidebar header's height (page.tsx) so the two top bands align. */}
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-border">
        <Image
          src="/logo.png"
          alt="Shadowbot"
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-full"
        />
      </div>
      <div className="flex flex-1 flex-col items-center gap-2 py-3">
        {VIEWS.map((view) => (
          <RailButton
            key={view.id}
            label={view.label}
            icon={view.icon}
            active={view.id === active}
            onClick={() => onChange(view.id)}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-2 py-3">
        <ModelSwitcher />
        <ApiKeyDialog />
        <StyleSwitcher />
        <CoverageDialog />
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href="/docs"
                aria-label="Documentation"
                className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              />
            }
          >
            <BookOpen className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="right">Documentation</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
