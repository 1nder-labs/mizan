/**
 * Passive panel rendered when the server reports an in-flight workflow
 * (status RUNNING or QUEUED) that this client did NOT initiate. The
 * workflow_events tape (mounted at the page level) calls
 * `queryClient.invalidateQueries` on the case-detail query the moment
 * `workflow.finish` arrives, which swaps this panel out for the
 * summary / action panel via `deriveMode`. No POST fires from here.
 */
import { Activity } from "lucide-react";
import type { CaseStatus } from "@mizan/shared";

interface BriefInflightProps {
  readonly status: CaseStatus;
}

const LABELS: Partial<Record<CaseStatus, string>> = {
  RUNNING: "Workflow running",
  QUEUED: "Queued for background processing",
};

export function BriefInflight({ status }: BriefInflightProps): React.JSX.Element {
  const label = LABELS[status] ?? "Workflow in progress";
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-elev-1">
      <div className="flex items-start gap-4 p-6">
        <Activity className="mt-0.5 size-4 shrink-0 animate-pulse text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-sm text-muted-foreground">
            Another session is composing this brief. This page will refresh automatically when the
            workflow finishes - no need to start a new run.
          </p>
        </div>
      </div>
    </div>
  );
}
