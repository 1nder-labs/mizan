/**
 * Centralised React Query key factory. Single source so invalidations
 * never drift from queries (PRD §7.7.5).
 */
import type { QueueSearch } from "@mizan/shared";
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
} as const;
