import { z } from "zod";

/**
 * Shape of every committed seed JSON file under
 * `packages/mastra/src/seeds/{documentary,community-vouching}`.
 *
 * Imported by integration tests and seed scripts so the on-disk JSON is
 * validated at the boundary instead of cast with `as`.
 */
export const SeedCaseSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["DRAFT", "QUEUED", "RUNNING", "READY_FOR_REVIEW"]),
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
