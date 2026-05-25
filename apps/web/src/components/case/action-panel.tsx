/**
 * HITL reviewer action panel for SUSPENDED_HITL cases.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CaseDetailResponse } from "@mizan/shared";
import { BriefSummaryCard } from "./brief-summary.tsx";
import { ActionForm } from "./action-form.tsx";
import { submitReviewerAction } from "@/lib/cases-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";

interface ActionPanelProps {
  readonly detail: CaseDetailResponse;
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
    onError: (error: Error) => {
      if (error.message.includes("not_suspended_or_claimed")) {
        toast.error("Another reviewer acted on this case");
        void queryClient.invalidateQueries({
          queryKey: queryKeys.cases.detail(detail.case.id),
          refetchType: "all",
        });
        return;
      }
      toast.error(error.message);
    },
  });

  return (
    <div
      className="relative space-y-4"
      aria-busy={mutation.isPending}
      style={mutation.isPending ? { pointerEvents: "none" } : undefined}
    >
      {detail.brief ? (
        <BriefSummaryCard payload={detail.brief.payload_json} composedAt={detail.brief.composed_at} />
      ) : null}
      <ActionForm
        pending={mutation.isPending}
        onSubmit={async (body) => {
          await mutation.mutateAsync(body);
        }}
      />
    </div>
  );
}
