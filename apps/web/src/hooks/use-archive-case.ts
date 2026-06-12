/**
 * Archive / unarchive mutation for a case. On success, invalidates the
 * case-detail query (so the button flips) and the queue list (so the archived
 * case leaves — or rejoins — the active board immediately).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setCaseArchived } from "@/lib/cases-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";

export function useArchiveCase(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => setCaseArchived(caseId, archived),
    onSuccess: (_data, archived) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.lists });
      toast.success(archived ? "Case archived" : "Case restored");
    },
    onError: () => toast.error("Couldn't update the archive state. Try again."),
  });
}
