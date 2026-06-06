/**
 * Centralised React Query key factory. Single source so invalidations
 * never drift from queries (PRD §7.7.5).
 */
import type { QueueSearch } from "@mizan/shared";
import { ME_QUERY_KEY } from "./me-api.ts";
import { SESSION_QUERY_KEY } from "./auth-client.ts";

export const queryKeys = {
  session: SESSION_QUERY_KEY,
  cases: {
    /**
     * The whole `["cases"]` subtree (detail + notes + list). Prefix-matches
     * everything below — only invalidate this when every cases query must
     * refresh. For a queue-list-only refresh use `lists`; it does NOT drag
     * detail/notes along.
     */
    all: ["cases"] as const,
    /** Prefix matching every `list(search)` query — queue-only invalidation. */
    lists: ["cases", "list"] as const,
    list: (search: QueueSearch) => ["cases", "list", search] as const,
    detail: (id: string) => ["cases", "detail", id] as const,
    notes: (id: string) => ["cases", "notes", id] as const,
  },
  audit: {
    all: ["audit"] as const,
  },
  signals: {
    detail: (caseId: string) => ["case-signals", caseId] as const,
  },
  chat: {
    threads: () => ["chat", "threads"] as const,
    thread: (id: string) => ["chat", "thread", id] as const,
  },
  notifications: {
    all: ["notifications"] as const,
  },
  portal: {
    campaigns: () => ["portal", "campaigns"] as const,
    campaign: (id: string) => ["portal", "campaign", id] as const,
    /**
     * Own root (not nested under `campaign(id)`) so invalidating a campaign's
     * detail does not also refetch its notes thread.
     */
    notes: (id: string) => ["portal", "notes", id] as const,
  },
  me: () => ME_QUERY_KEY,
} as const;
