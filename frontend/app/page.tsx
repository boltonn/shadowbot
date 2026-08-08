"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatPanel } from "@/features/chat/components/chat-panel";
import { RoutingPanel } from "@/features/routing/components/routing-panel";
import { GeodataPanel } from "@/features/geodata/components/geodata-panel";
import { MapView } from "@/features/map/components/map-view";
import { ResizableSidebar } from "@/components/resizable-sidebar";

export default function Home() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div className="relative flex-1">
        <MapView />
      </div>
      <ResizableSidebar>
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <Image
            src="/logo.png"
            alt="Shadowbot"
            width={20}
            height={20}
            className="size-5 shrink-0 rounded-full"
          />
          <span className="font-mono text-xs font-medium tracking-[0.2em] text-foreground uppercase">
            Shadowbot
          </span>
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-signal" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/docs"
                    className="ml-auto text-muted-foreground transition-colors hover:text-signal"
                  />
                }
              >
                <BookOpen className="size-4" />
                <span className="sr-only">Documentation</span>
              </TooltipTrigger>
              <TooltipContent>Documentation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <Tabs defaultValue="chat" className="flex h-full min-h-0 flex-1 flex-col gap-0">
            <TabsList
              variant="line"
              className="h-auto w-full shrink-0 justify-start gap-0 border-b border-border bg-transparent p-0"
            >
              <TabsTrigger
                value="chat"
                className="h-10 flex-1 rounded-none font-mono text-[11px] tracking-[0.15em] uppercase after:bg-signal data-active:text-signal"
              >
                Chat
              </TabsTrigger>
              <TabsTrigger
                value="routes"
                className="h-10 flex-1 rounded-none font-mono text-[11px] tracking-[0.15em] uppercase after:bg-signal data-active:text-signal"
              >
                Routes
              </TabsTrigger>
              <TabsTrigger
                value="geodata"
                className="h-10 flex-1 rounded-none font-mono text-[11px] tracking-[0.15em] uppercase after:bg-signal data-active:text-signal"
              >
                Geodata
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
              <ChatPanel />
            </TabsContent>
            <TabsContent value="routes" className="min-h-0 flex-1 overflow-y-auto">
              <RoutingPanel />
            </TabsContent>
            <TabsContent value="geodata" className="min-h-0 flex-1 overflow-y-auto">
              <GeodataPanel />
            </TabsContent>
          </Tabs>
        </div>
      </ResizableSidebar>
    </div>
  );
}
