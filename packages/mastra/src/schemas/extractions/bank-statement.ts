import { z } from "zod";

/** Structured fields extracted from the organizer bank statement. */
export const BankStatementSchema = z.object({
  account_holder_name: z.string(),
  /** Whether the account holder is the same person as the claimed organizer (semantic, not spelling). */
  matches_organizer_name: z.boolean(),
  /** One-line reason for `matches_organizer_name` — the reviewer-facing rationale. */
  organizer_name_match_reason: z.string(),
  currency: z.string(),
  statement_period_iso: z.string(),
  latest_balance_redacted: z.string(),
  suspicious_activity_detected: z.boolean(),
  confidence: z.number(),
});
