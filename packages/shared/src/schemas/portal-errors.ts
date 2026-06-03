import { z } from "zod";

/**
 * Error codes returned by the client portal routes (`/api/portal/*`). Mirrors
 * the per-surface error-body pattern (`DocumentUrlErrorBodySchema`,
 * `ActionErrorBodySchema`) so the wire contract is a single source of truth
 * shared by the worker routes and the web client. Extended by later portal
 * units (campaign edit conflict, evidence-upload failures) as new failure
 * modes land.
 */
export const PortalErrorCodeEnum = z.enum([
  "campaign_not_found",
  "case_no_longer_draft",
  "case_decided",
  "invalid_evidence",
]);
export type PortalErrorCode = z.infer<typeof PortalErrorCodeEnum>;

export const PortalErrorBodySchema = z.object({ error: PortalErrorCodeEnum }).strict();
export type PortalErrorBody = z.infer<typeof PortalErrorBodySchema>;
