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
    all: ["cases"] as const,
    list: (search: QueueSearch) => ["cases", "list", search] as const,
    detail: (id: string) => ["cases", "detail", id] as const,
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
  portal: {
    campaigns: () => ["portal", "campaigns"] as const,
    campaign: (id: string) => ["portal", "campaign", id] as const,
    notes: (id: string) => ["portal", "campaign", id, "notes"] as const,
  },
  me: () => ME_QUERY_KEY,
} as const;
