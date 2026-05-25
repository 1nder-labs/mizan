/**
 * Polls case detail while a 409 in-flight producer-guard is active.
 *
 * The `active` ref guards every async `setRefreshing(false)` so an
 * invalidation that resolves AFTER unmount / disable cannot call
 * `setState` on a torn-down component.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys.ts";

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_TICKS = 120;

function useInflightPoll(caseId: string, enabled: boolean): boolean {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setRefreshing(false);
      return;
    }
    activeRef.current = true;
    let ticks = 0;
    const handle = setInterval(() => {
      ticks += 1;
      if (ticks > POLL_MAX_TICKS) {
        clearInterval(handle);
        if (activeRef.current) setRefreshing(false);
        return;
      }
      if (activeRef.current) setRefreshing(true);
      void queryClient
        .invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        })
        .finally(() => {
          if (activeRef.current) setRefreshing(false);
        });
    }, POLL_INTERVAL_MS);
    return () => {
      activeRef.current = false;
      clearInterval(handle);
      setRefreshing(false);
    };
  }, [caseId, enabled, queryClient]);

  return refreshing;
}

export { useInflightPoll };
