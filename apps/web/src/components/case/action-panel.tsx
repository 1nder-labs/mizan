/**
 * HITL reviewer action panel for SUSPENDED_HITL cases.
 *
 * Post-success: panel disables until the case-detail refetch swaps
 * `cases.status` off SUSPENDED_HITL (at which point the parent
 * unmounts this component). This is the lockout that prevents a
 * second submit from inside the same form mount — the action_id is
 * stable per mount so a second click would either hit the KV cache
 * and return the first result, or race the 409 guard. Locking the
 * form removes the confusion before either happens.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CaseDetailResponse } from "@mizan/shared";
import { BriefSummaryCard } from "./brief-summary.tsx";
import { ActionForm } from "./action-form.tsx";
import { ReviewerActionError, submitReviewerAction } from "@/lib/cases-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";

interface ActionPanelProps {
  readonly detail: CaseDetailResponse;
}

function describeError(error: unknown): string {
  if (!(error instanceof ReviewerActionError)) {
    return error instanceof Error ? error.message : "Action failed";
  }
  switch (error.code) {
    case "not_suspended_or_claimed":
      return "Another reviewer acted on this case";
    case "not_found":
      return "Case not found";
    case "no_run":
      return "Case has no active workflow run";
    case "workflow_failed":
      return "Workflow failed to resume — try again";
  }
}

export function ActionPanel({ detail }: ActionPanelProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof submitReviewerAction>[1]) =>
      submitReviewerAction(detail.case.id, body),
    onSuccess: async () => {
      toast.success("Action recorded");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.cases.detail(detail.case.id),
        refetchType: "all",
      });
    },
    onError: (error) => {
      toast.error(describeError(error));
      if (error instanceof ReviewerActionError && error.code === "not_suspended_or_claimed") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cases.detail(detail.case.id),
          refetchType: "all",
        });
      }
    },
  });

  const formLocked = mutation.isPending || mutation.isSuccess;

  return (
    <div
      className="relative space-y-4"
      aria-busy={mutation.isPending}
      style={mutation.isPending ? { pointerEvents: "none" } : undefined}
    >
      {detail.brief ? (
        <BriefSummaryCard
          payload={detail.brief.payload_json}
          composedAt={detail.brief.composed_at}
        />
      ) : null}
      <ActionForm
        pending={formLocked}
        onSubmit={async (body) => {
          await mutation.mutateAsync(body);
        }}
      />
    </div>
  );
}
