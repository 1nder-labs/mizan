/**
 * Brief-state empty / error / not-yet-generated card. Routed by the
 * case-detail container based on case status; never renders for
 * RUNNING (streamed) or READY_FOR_REVIEW / ACTIONED (briefSummary).
 */
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import type { CaseStatus } from "@mizan/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

const EMPTY_COPY: Partial<Record<CaseStatus, { title: string; body: string }>> = {
  DRAFT: {
    title: "Brief not yet generated",
    body: "Generate to compose the reviewer brief for this case.",
  },
  QUEUED: {
    title: "Brief queued",
    body: "A worker will pick this up in the background; refresh in a moment.",
  },
  SUSPENDED_HITL: {
    title: "Paused for reviewer input",
    body: "Workflow is awaiting a reviewer signal before continuing.",
  },
  FAILED: {
    title: "Brief generation failed",
    body: "The workflow returned an error. Retry from the queue.",
  },
};

export function BriefEmptyState({ status }: { readonly status: CaseStatus }): React.JSX.Element {
  if (status === "FAILED") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{EMPTY_COPY.FAILED?.title}</AlertTitle>
        <AlertDescription>{EMPTY_COPY.FAILED?.body}</AlertDescription>
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
        {status === "DRAFT" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              toast.info("Reviewer-initiated regenerate ships in Phase 7.")
            }
          >
            <Sparkles className="mr-2 size-3.5" />
            Generate brief
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
