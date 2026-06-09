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
import { BriefDetailTabs } from "./brief-details.tsx";
import { ActionForm } from "./action-form.tsx";
import { ReviewerActionError, submitReviewerAction } from "@/lib/cases-api.ts";
import { describeActionError } from "@/lib/describe-action-error.ts";
import { queryKeys } from "@/lib/query-keys.ts";

interface ActionPanelProps {
  readonly detail: Pick<CaseDetailResponse, "case" | "brief" | "overlay">;
}

/** Mutation wiring for the HITL reviewer action submit. */
function useActionMutation(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof submitReviewerAction>[1]) =>
      submitReviewerAction(caseId, body),
    onSuccess: async () => {
      toast.success("Action recorded");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.cases.detail(caseId),
        refetchType: "all",
      });
    },
    onError: (error) => {
      toast.error(describeActionError(error));
      if (error instanceof ReviewerActionError && error.code === "not_suspended_or_claimed") {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        });
      }
    },
  });
}

export function ActionPanel({ detail }: ActionPanelProps): React.JSX.Element {
  const mutation = useActionMutation(detail.case.id);
  const formLocked = mutation.isPending || mutation.isSuccess;
  return (
    <div
      className="relative space-y-4"
      aria-busy={mutation.isPending}
      style={mutation.isPending ? { pointerEvents: "none" } : undefined}
    >
      {detail.brief ? (
        <>
          <BriefSummaryCard
            payload={detail.brief.payload_json}
            composedAt={detail.brief.composed_at}
          />
          <BriefDetailTabs payload={detail.brief.payload_json} />
        </>
      ) : null}
      <div className="rounded-xl border border-border/70 bg-card shadow-elev-1">
        <div className="border-b border-border/50 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reviewer Action
          </h2>
        </div>
        <div className="p-5">
          <ActionForm
            pending={formLocked}
            {...(detail.brief ? { recommendation: detail.brief.payload_json.recommendation } : {})}
            onSubmit={async (body) => {
              await mutation.mutateAsync(body);
            }}
          />
        </div>
      </div>
    </div>
  );
}
