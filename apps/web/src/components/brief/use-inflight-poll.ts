/**
 * Polls case detail while a 409 in-flight producer-guard is active.
 *
 * Fires one immediate invalidation when `enabled` flips true, then
 * polls every 5s — without the eager call the reviewer sees stale
 * RUNNING UI for the full poll interval after the 409 returns.
 *
 * The `active` ref guards every async `setRefreshing(false)` so an
 * invalidation that resolves AFTER unmount / disable cannot call
 * `setState` on a torn-down component.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys.ts";

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_TICKS = 120;

function fireInvalidate(
  queryClient: QueryClient,
  caseId: string,
  active: { current: boolean },
  setRefreshing: (next: boolean) => void,
): void {
  if (active.current) setRefreshing(true);
  void queryClient
    .invalidateQueries({
      queryKey: queryKeys.cases.detail(caseId),
      refetchType: "all",
    })
    .finally(() => {
      if (active.current) setRefreshing(false);
    });
}

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
    fireInvalidate(queryClient, caseId, activeRef, setRefreshing);
    let ticks = 0;
    const handle = setInterval(() => {
      ticks += 1;
      if (ticks > POLL_MAX_TICKS) {
        clearInterval(handle);
        if (activeRef.current) setRefreshing(false);
        return;
      }
      fireInvalidate(queryClient, caseId, activeRef, setRefreshing);
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
