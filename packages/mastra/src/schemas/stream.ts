import type { JsonValue } from "./json-value.ts";

/** Workflow SSE part shape consumed by the brief route (Phase 6 re-exports to shared). */
export type BriefStreamPart = {
  readonly type: string;
  readonly id?: string;
  readonly data?: JsonValue;
};
