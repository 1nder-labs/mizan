/**
 * Phase 7.6 — case assignment mutation.
 *
 * On success, invalidates both the case-detail query (so the dropdown
 * reflects the new assignee) and the queue list (so the filter applies
 * to the new assignment immediately).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CaseAssignErrorBodySchema,
  CaseAssignResponseSchema,
  type CaseAssignErrorCode,
  type CaseAssignResponse,
} from "@mizan/shared";
import { apiMutate } from "@/lib/rpc.ts";
import { assertAuthorized } from "@/lib/cases-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";

export class CaseAssignError extends Error {
  readonly code: CaseAssignErrorCode;
  readonly status: number;
  constructor(code: CaseAssignErrorCode, status: number) {
    super(code);
    this.name = "CaseAssignError";
    this.code = code;
    this.status = status;
  }
}

export interface AssignInput {
  readonly caseId: string;
  readonly userId: string | null;
}

async function readAssignError(res: {
  readonly status: number;
  json(): Promise<unknown>;
}): Promise<CaseAssignError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = CaseAssignErrorBodySchema.safeParse(body);
  return new CaseAssignError(parsed.success ? parsed.data.error : "forbidden", res.status);
}

export function useAssignCase() {
  const queryClient = useQueryClient();
  return useMutation<CaseAssignResponse, CaseAssignError | Error, AssignInput>({
    mutationFn: async ({ caseId, userId }) => {
      const res = await apiMutate.cases[":id"].assign.$post({
        param: { id: caseId },
        json: { user_id: userId },
      });
      assertAuthorized(res.status);
      if (!res.ok) throw await readAssignError(res);
      return CaseAssignResponseSchema.parse(await res.json());
    },
    onSuccess: (_data, input) => {
      toast.success(input.userId ? "Case assigned" : "Case unassigned");
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(input.caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.lists });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
