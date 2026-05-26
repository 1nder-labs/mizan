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
    <div className="rounded-md border border-border bg-card/40 p-6 text-sm">
      <div className="flex items-center gap-3">
        <Activity className="size-4 animate-pulse text-muted-foreground" />
        <div>
          <p className="font-medium text-foreground">{label}</p>
          <p className="mt-1 text-muted-foreground">
            Another session is composing this brief. This page will refresh automatically when the
            workflow finishes — no need to start a new run.
          </p>
        </div>
      </div>
    </div>
  );
}
