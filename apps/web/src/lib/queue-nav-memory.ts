/**
 * Remembers the reviewer's last queue search across a queue → case → queue round
 * trip. The queue page persists its search here on every change; the case
 * detail's "Back to queue" link reads it so filters (outcome, category, country,
 * archived, sort, page) survive instead of snapping back to defaults. Backed by
 * sessionStorage so it is per-tab and clears when the tab closes.
 */
import { DEFAULT_QUEUE_SEARCH, QueueSearchSchema, type QueueSearch } from "@mizan/shared";

const STORAGE_KEY = "mizan.queue.search";

/** Persists the current queue search for later restoration. Never throws. */
export function saveQueueSearch(search: QueueSearch): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(search));
  } catch {}
}

/**
 * Reads the remembered queue search, falling back to the default when nothing is
 * stored or the stored value is corrupt. Always returns a valid `QueueSearch`.
 */
export function loadQueueSearch(): QueueSearch {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_QUEUE_SEARCH;
    const parsed = QueueSearchSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_QUEUE_SEARCH;
  } catch {
    return DEFAULT_QUEUE_SEARCH;
  }
}
