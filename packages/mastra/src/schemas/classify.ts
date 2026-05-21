import { z } from "zod";

/** Deterministic classifier output for Phase 2 documentary path. */
export const ClassifyOutputSchema = z.object({
  verification_path: z.enum(["documentary", "trust_signal", "hybrid"]),
});
