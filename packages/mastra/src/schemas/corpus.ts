import { z } from "zod";

/** Single clause in a committed policy corpus JSON file. */
export const ClauseSchema = z.object({
  clauseId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
});

/** Top-level shape for zakat-policy.json and safety-policy.json. */
export const CorpusSchema = z.object({
  source: z.enum(["zakat", "safety"]),
  corpusVersion: z.string().min(1),
  policyUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
  clauses: ClauseSchema.array().min(1),
});

export type Clause = z.infer<typeof ClauseSchema>;
export type Corpus = z.infer<typeof CorpusSchema>;
