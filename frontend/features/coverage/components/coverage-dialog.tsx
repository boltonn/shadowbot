"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { ExternalLink, Signal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRoutingCoverage } from "@/features/coverage/hooks/use-routing-coverage";
import { buildCoverageIssueUrl } from "@/features/coverage/lib/github-issue-url";

const DEFAULT_TRIGGER = (
  <Button
    type="button"
    variant="ghost"
    aria-label="Routing coverage"
    className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
  />
);

/**
 * Which regions have fast, pre-compiled routing, plus a way to request more — shown from
 * a dialog rather than a floating map overlay so it doesn't compete with in-map panels
 * like RouteSummary (features/routing/components/route-summary.tsx) for the same corner.
 * Self-contained (owns its own open state), so it can be dropped in wherever a trigger
 * makes sense (the activity rail, the docs page) without any shared state wiring.
 */
export function CoverageDialog({ trigger }: { trigger?: ReactElement }) {
  const { data } = useRoutingCoverage();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState("");

  const handleRequest = () => {
    const url = buildCoverageIssueUrl({ place: place.trim() || undefined });
    window.open(url, "_blank", "noopener,noreferrer");
    setPlace("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : (
        <Tooltip>
          <TooltipTrigger render={<DialogTrigger render={DEFAULT_TRIGGER} />}>
            <Signal className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="right">Routing coverage</TooltipContent>
        </Tooltip>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Routing coverage</DialogTitle>
          <DialogDescription>
            {data?.backend === "networkx"
              ? "This deployment routes live, everywhere — no pre-compiled regions, so every request is slower but nothing is off-limits."
              : "Routing runs fast and in-process only within these pre-compiled regions. Anywhere else, a route or search won't work until an administrator compiles and adds that area."}
          </DialogDescription>
        </DialogHeader>

        {data?.backend === "valhalla" && (
          <ul className="flex flex-col gap-1.5">
            {data.regions.length > 0 ? (
              data.regions.map((region) => (
                <li key={region.name} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="size-1 shrink-0 rounded-full bg-signal" />
                  {region.url ? (
                    <a
                      href={region.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-signal hover:underline"
                    >
                      {region.name}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    region.name
                  )}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No regions compiled yet.</li>
            )}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="coverage-place-input" className="text-xs font-normal text-muted-foreground">
            Request a new location
          </Label>
          <Input
            id="coverage-place-input"
            placeholder="e.g. Seattle, WA"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
          <Button type="button" onClick={handleRequest}>
            Open GitHub issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
