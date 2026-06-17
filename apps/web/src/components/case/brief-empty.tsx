/**
 * Brief-state empty / error / not-yet-generated card. Routed by the
 * case-detail container based on case status.
 *
 * Statuses with a re-generate affordance:
 *   - DRAFT: never generated, primary CTA
 *   - FAILED: errored mid-flight, destructive variant with retry CTA
 *   - RUNNING: only reachable here when the parent's stream-phase
 *     machine flipped to `streamErrored` (SSE died and the resume-GET
 *     could not reconnect). The reviewer clicks Generate to re-attach
 *     to the still-RUNNING DO stream (producer guard REJOINS, no 409).
 *
 * Statuses without an affordance (waiting on someone else or terminal):
 *   - QUEUED / SUSPENDED_HITL — owned by the queue consumer or HITL
 *     resume flow; surfacing a Generate button here would race the
 *     producer-guard. QUEUED renders BriefStream with autoStart=false
 *     (resume-only) so this empty card is never shown for QUEUED unless
 *     the stream errored.
 *   - ACTIONED — terminal status; the producer guard correctly 409s any
 *     POST on an ACTIONED case, so no Generate affordance is shown. The
 *     ACTIONED+null-brief path (degraded parse) shows an admin-contact
 *     message instead.
 */
import { BrainCircuit } from "lucide-react";
import type { CaseStatus } from "@mizan/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

interface StatusCopy {
  readonly title: string;
  readonly body: string;
}

const FALLBACK_COPY: StatusCopy = {
  title: "No brief on file",
  body: "The case is marked reviewed but a composed brief could not be loaded. Contact an admin to investigate — this brief cannot be regenerated after a decision.",
};

const RUNNING_ERROR_COPY: StatusCopy = {
  title: "Stream interrupted",
  body: "The live brief stream closed before completing. The workflow is still running in the background — click Generate to re-attach to the live stream.",
};

const STATUSES_WITH_GENERATE: ReadonlySet<CaseStatus> = new Set(["DRAFT", "QUEUED", "RUNNING"]);

const EMPTY_COPY: Record<CaseStatus, StatusCopy> = {
  DRAFT: {
    title: "No brief yet",
    body: "Start a workflow to compose the reviewer brief. You'll see live progress as it runs.",
  },
  /**
   * QUEUED only reaches this empty card when the live stream errored (the normal
   * QUEUED path mounts the resume-only stream). Mirror RUNNING's reconnect CTA —
   * the run is still queued/in-flight, so Generate rejoins rather than 409s.
   */
  QUEUED: {
    title: "Stream interrupted",
    body: "The live brief stream dropped. The case is still queued in the background — click Generate to re-attach to the live stream.",
  },
  SUSPENDED_HITL: {
    title: "Awaiting your input",
    body: "The workflow paused for a reviewer signal before it can continue.",
  },
  FAILED: {
    title: "Brief generation failed",
    body: "Something went wrong while composing this brief. You can try again.",
  },
  RUNNING: RUNNING_ERROR_COPY,
  ACTIONED: FALLBACK_COPY,
};

function GenerateBriefButton({
  onGenerate,
}: {
  readonly onGenerate: () => void;
}): React.JSX.Element {
  return (
    <Button size="sm" onClick={onGenerate}>
      <BrainCircuit className="mr-2 size-3.5" />
      Generate brief
    </Button>
  );
}

export function BriefEmptyState({
  status,
  onGenerate,
}: {
  readonly status: CaseStatus;
  readonly onGenerate: () => void;
}): React.JSX.Element {
  const copy = EMPTY_COPY[status];

  if (status === "FAILED") {
    return (
      <Alert variant="destructive" className="flex flex-col gap-3">
        <div>
          <AlertTitle>{copy.title}</AlertTitle>
          <AlertDescription>{copy.body}</AlertDescription>
        </div>
        <div>
          <GenerateBriefButton onGenerate={onGenerate} />
        </div>
      </Alert>
    );
  }

  return (
    <Card className="border-dashed border-border/70 bg-card/40 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-[-0.01em]">{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        {STATUSES_WITH_GENERATE.has(status) ? (
          <GenerateBriefButton onGenerate={onGenerate} />
        ) : null}
      </CardContent>
    </Card>
  );
}
