import { z } from "zod";

/** Structured fields extracted from the organizer bank statement. */
export const BankStatementSchema = z.object({
  account_holder_name: z.string(),
  currency: z.string(),
  statement_period_iso: z.string(),
  latest_balance_redacted: z.string(),
  suspicious_activity_detected: z.boolean(),
  confidence: z.number(),
});
