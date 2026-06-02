import { z } from "zod";

/**
 * Shape of every committed seed JSON file under
 * `packages/mastra/src/seeds/{documentary,community-vouching}`.
 *
 * Imported by integration tests AND `scripts/seed-cases.ts` so the
 * on-disk JSON is validated at the boundary instead of cast. Living in
 * `@mizan/shared` (not `@mizan/mastra/testing`) means deploy scripts
 * can validate seeds without dragging in the workflow package's
 * test-only subpath.
 */
export const SeedCaseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["DRAFT", "QUEUED", "RUNNING", "READY_FOR_REVIEW"]),
    title: z.string().min(1),
    category: z.string().min(1),
    geography: z.string().min(1),
    claimed_zakat_category: z.string().min(1),
    organizer_name: z.string().min(1),
    story: z.string().min(1),
    vouching_narrative: z.string().min(1).optional(),
    r2_keys: z.object({
      creator_id: z.string().min(1),
      bank_statement: z.string().min(1),
      category_doc: z.string().min(1),
    }),
  })
  .strict();

export type SeedCase = z.infer<typeof SeedCaseSchema>;
