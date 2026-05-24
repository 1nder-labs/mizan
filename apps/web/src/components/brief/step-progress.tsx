/**
 * Vertical step list rendered from the workflow's `data-workflow`
 * stream parts. Lucide vector dots (no emoji); fixed-width tabular
 * duration column for grid alignment.
 */
import { Check, Circle, Loader2, OctagonX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";

export type StepState = "pending" | "running" | "done" | "failed";

export interface StepEntry {
  readonly id: string;
  readonly label: string;
  readonly state: StepState;
  readonly durationMs?: number;
  readonly note?: string;
}

function StepIcon({ state }: { readonly state: StepState }): React.JSX.Element {
  if (state === "done") return <Check className="size-3.5 text-status-success-foreground" />;
  if (state === "running")
    return <Loader2 className="size-3.5 animate-spin text-status-info-foreground" />;
  if (state === "failed")
    return <OctagonX className="size-3.5 text-status-destructive-foreground" />;
  return <Circle className="size-3.5 text-muted-foreground/60" />;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function StepRow({ step }: { readonly step: StepEntry }): React.JSX.Element {
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full border",
          step.state === "done" && "border-status-success-border bg-status-success",
          step.state === "running" && "border-status-info-border bg-status-info",
          step.state === "failed" && "border-status-destructive-border bg-status-destructive",
          step.state === "pending" && "border-border bg-muted/40",
        )}
      >
        <StepIcon state={step.state} />
      </span>
      <span className="font-mono text-xs text-foreground tabular">{step.id}</span>
      <span className="flex-1 truncate text-sm text-muted-foreground">{step.label}</span>
      {step.durationMs !== undefined ? (
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground tabular">
          {formatDuration(step.durationMs)}
        </span>
      ) : null}
    </li>
  );
}

export function StepProgress({ steps }: { readonly steps: readonly StepEntry[] }): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Workflow</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {steps.length === 0 ? (
          <p className="text-xs text-muted-foreground">Waiting for first step…</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
