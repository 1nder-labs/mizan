/**
 * Polls case detail while a 409 in-flight producer-guard is active.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys.ts";

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_TICKS = 120;

function useInflightPoll(caseId: string, enabled: boolean): boolean {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRefreshing(false);
      return;
    }
    let ticks = 0;
    const handle = setInterval(() => {
      ticks += 1;
      if (ticks > POLL_MAX_TICKS) {
        clearInterval(handle);
        setRefreshing(false);
        return;
      }
      setRefreshing(true);
      void queryClient
        .invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        })
        .finally(() => setRefreshing(false));
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(handle);
      setRefreshing(false);
    };
  }, [caseId, enabled, queryClient]);

  return refreshing;
}

export { useInflightPoll };
