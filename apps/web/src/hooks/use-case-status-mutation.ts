/**
 * Kanban drag-end mutation hook. Fires the existing brief-enqueue
 * route (`POST /api/cases/:id/brief`) for `DRAFT → QUEUED`. The
 * `SUSPENDED_HITL → ACTIONED` path opens the action modal and does
 * NOT fire from here — the modal owns that POST so rationale + the
 * drag-resolved `action_id` flow through one boundary.
 *
 * Optimistic UI: queue cache updates immediately to the target
 * status; on failure a rollback restores the snapshot and a toast
 * surfaces the cause. Pattern mirrors the noro-cortex
 * `useCaseStatusMutation`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type CaseStatus, type QueueResponse, type QueueSearch } from "@mizan/shared";
import { apiMutate } from "@/lib/rpc.ts";
import { assertAuthorized } from "@/lib/cases-api.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { statusDisplay } from "@/lib/copy-constants.ts";
import { queryKeys } from "@/lib/query-keys.ts";

export interface DragMutationInput {
  readonly caseId: string;
  readonly targetStatus: CaseStatus;
  readonly search: QueueSearch;
}

interface QueueSnapshot {
  readonly key: ReturnType<typeof queryKeys.cases.list>;
  readonly previous: QueueResponse | undefined;
}

function readErrorReason(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("error" in body)) return fallback;
  const record: Record<string, unknown> = body;
  const err = record.error;
  return typeof err === "string" ? err : fallback;
}

async function enqueueBriefForCase(caseId: string): Promise<void> {
  const res = await apiMutate.cases[":id"].brief.$post({ param: { id: caseId } });
  assertAuthorized(res.status);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(readErrorReason(body, `enqueue failed ${res.status}`));
  }
}

function setStatusInPage(page: QueueResponse, caseId: string, status: CaseStatus): QueueResponse {
  return {
    ...page,
    cases: page.cases.map((row) => (row.id === caseId ? { ...row, status } : row)),
  };
}

export function useCaseStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DragMutationInput, QueueSnapshot>({
    mutationFn: async (input) => {
      if (input.targetStatus === "QUEUED") {
        await enqueueBriefForCase(input.caseId);
        return;
      }
      throw new Error(`reviewer-driven transition to ${input.targetStatus} not supported`);
    },
    onMutate: async (input) => {
      const key = queryKeys.cases.list(input.search);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<QueueResponse>(key);
      if (previous) {
        queryClient.setQueryData<QueueResponse>(
          key,
          setStatusInPage(previous, input.caseId, input.targetStatus),
        );
      }
      return { key, previous };
    },
    onError: (error, _input, snapshot) => {
      if (snapshot?.previous) queryClient.setQueryData(snapshot.key, snapshot.previous);
      toast.error(COPY.queue.moveError, { description: error.message });
    },
    onSuccess: (_data, input) => {
      toast.success(COPY.queue.moveSuccess(statusDisplay(input.targetStatus)));
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.list(input.search) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(input.caseId) });
    },
  });
}
