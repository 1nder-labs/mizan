/**
 * Brief-state empty / error / not-yet-generated card. Routed by the
 * case-detail container based on case status.
 *
 * Statuses with a re-generate affordance:
 *   - DRAFT: never generated, primary CTA
 *   - FAILED: errored mid-flight, destructive variant with retry CTA
 *   - READY_FOR_REVIEW / ACTIONED with null brief (degraded parse path
 *     in `apps/worker/src/routes/cases-list.ts` — see safeParse fallback
 *     comment) so the reviewer can re-trigger composition instead of
 *     hitting a dead-end "no brief on file" card with no recovery
 *
 * Statuses without an affordance (waiting on someone else):
 *   - QUEUED / SUSPENDED_HITL / RUNNING — owned by the queue consumer
 *     or another in-flight stream; surfacing a Generate button here
 *     would race the producer-guard at `apps/worker/src/routes/cases.ts`.
 */
import { Sparkles } from "lucide-react";
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
  body: "The case is marked reviewed but we couldn't load a composed brief. You can re-run composition to recover it.",
};

const STATUSES_WITH_GENERATE: ReadonlySet<CaseStatus> = new Set([
  "DRAFT",
  "READY_FOR_REVIEW",
  "ACTIONED",
]);

const EMPTY_COPY: Record<CaseStatus, StatusCopy> = {
  DRAFT: {
    title: "No brief yet",
    body: "Start a workflow to compose the reviewer brief. You'll see live progress as it runs.",
  },
  QUEUED: {
    title: "Waiting to start",
    body: "This case is queued. A background worker will pick it up in a moment.",
  },
  SUSPENDED_HITL: {
    title: "Awaiting your input",
    body: "The workflow paused for a reviewer signal before it can continue.",
  },
  FAILED: {
    title: "Brief generation failed",
    body: "Something went wrong while composing this brief. You can try again.",
  },
  RUNNING: FALLBACK_COPY,
  READY_FOR_REVIEW: FALLBACK_COPY,
  ACTIONED: FALLBACK_COPY,
};

function GenerateBriefButton({
  onGenerate,
}: {
  readonly onGenerate: () => void;
}): React.JSX.Element {
  return (
    <Button size="sm" onClick={onGenerate}>
      <Sparkles className="mr-2 size-3.5" />
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
        <CardTitle className="text-sm font-medium">{copy.title}</CardTitle>
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
