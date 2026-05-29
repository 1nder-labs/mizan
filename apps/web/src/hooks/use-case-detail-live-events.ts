import type { CaseRow } from "@mizan/shared";
import { useLiveEvents } from "@/hooks/use-live-events.ts";
import { useViewerTopics } from "@/hooks/use-viewer-topics.ts";

/** Subscribes case detail to case + org live-event topics. */
export function useCaseDetailLiveEvents(caseRow: CaseRow): void {
  const { orgId } = useViewerTopics();
  useLiveEvents(`case:${caseRow.id}`);
  useLiveEvents(orgId ? `org:${orgId}` : "", { enabled: Boolean(orgId) });
}
