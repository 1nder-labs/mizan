export * from "./schema.ts";

import {
  briefs,
  cases,
  reviewer_actions,
  signals,
  workflow_events,
} from "./schema.ts";

/**
 * Aggregate schema record for consumers that pass `schema` to Drizzle or
 * `createAuth`. U6 expands this by spreading `...authSchema` once
 * `auth.schema.ts` is generated and the merged barrel is composed.
 */
export const schema = {
  cases,
  briefs,
  signals,
  reviewer_actions,
  workflow_events,
} as const;
