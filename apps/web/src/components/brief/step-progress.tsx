/**
 * Vertical step list rendered from the workflow's `data-workflow`
 * stream parts. Lucide vector dots (no emoji); fixed-width tabular
 * duration column for grid alignment.
 *
 * Active step (running) uses the accent-bar signature: a 3px left
 * foreground bar + faint bg-muted pill. Completed steps show a subtle
 * success check. Pending steps are muted. No filled coloured badges on
 * any step — monochrome chrome with semantic color only for done/failed.
 */
import { Check, Circle, LoaderCircle, OctagonX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";
import type { StepEntry, StepState } from "./stream-types.ts";

function StepIcon({ state }: { readonly state: StepState }): React.JSX.Element {
  if (state === "done") return <Check className="size-3.5 text-status-success-foreground" />;
  if (state === "running")
    return <LoaderCircle className="size-3.5 animate-spin text-foreground" />;
  if (state === "failed")
    return <OctagonX className="size-3.5 text-status-destructive-foreground" />;
  return <Circle className="size-3.5 text-muted-foreground/40" />;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function StepRow({ step }: { readonly step: StepEntry }): React.JSX.Element {
  const isRunning = step.state === "running";
  const isDone = step.state === "done";
  const isFailed = step.state === "failed";
  return (
    <li
      className={cn(
        "relative flex items-center gap-3 py-2.5 pl-4 pr-2 transition-colors",
        isRunning && "bg-muted/40",
      )}
    >
      {isRunning ? (
        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-foreground" />
      ) : null}
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border",
          isDone && "border-status-success-border bg-status-success",
          isRunning && "border-border bg-background",
          isFailed && "border-status-destructive-border bg-status-destructive",
          step.state === "pending" && "border-border/50 bg-transparent",
        )}
      >
        <StepIcon state={step.state} />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground tabular">{step.id}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-sm",
            isRunning ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {step.label}
        </span>
        {step.detail ? (
          <span className="truncate text-xs text-muted-foreground/70">{step.detail}</span>
        ) : null}
      </span>
      {step.durationMs !== undefined ? (
        <span className="font-numeric rounded-sm bg-muted px-1.5 py-0.5 text-[10px] tabular text-muted-foreground">
          {formatDuration(step.durationMs)}
        </span>
      ) : null}
    </li>
  );
}

export function StepProgress({
  steps,
}: {
  readonly steps: readonly StepEntry[];
}): React.JSX.Element {
  return (
    <Card className="border-border/60 shadow-elev-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold tracking-tight">Workflow</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {steps.length === 0 ? (
          <p className="pl-4 text-xs text-muted-foreground">Waiting for first step…</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
