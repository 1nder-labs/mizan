/**
 * Brief-state empty / error / not-yet-generated card. Routed by the
 * case-detail container based on case status; never renders for
 * RUNNING (streamed) or READY_FOR_REVIEW / ACTIONED (briefSummary).
 *
 * DRAFT / FAILED carry an action that asks the parent to mount the
 * `<BriefStream>` consumer. The parent (CaseDetail) owns whether the
 * stream is rendered; this card only signals intent. Single-POST
 * architecture: the stream component owns the only network call.
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

const EMPTY_COPY: Partial<Record<CaseStatus, StatusCopy>> = {
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
  if (status === "FAILED") {
    return (
      <Alert variant="destructive" className="flex flex-col gap-3">
        <div>
          <AlertTitle>{EMPTY_COPY.FAILED?.title}</AlertTitle>
          <AlertDescription>{EMPTY_COPY.FAILED?.body}</AlertDescription>
        </div>
        <div>
          <GenerateBriefButton onGenerate={onGenerate} />
        </div>
      </Alert>
    );
  }

  const copy = EMPTY_COPY[status];
  if (!copy) return <></>;

  return (
    <Card className="border-dashed border-border/70 bg-card/40 shadow-none">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{copy.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        {status === "DRAFT" ? <GenerateBriefButton onGenerate={onGenerate} /> : null}
      </CardContent>
    </Card>
  );
}
