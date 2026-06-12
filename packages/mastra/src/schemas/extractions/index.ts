import { z } from "zod";
import { BankStatementSchema } from "./bank-statement.ts";
import { CategoryDocsSchema } from "./category-docs.ts";
import { CreatorIdSchema } from "./creator-id.ts";
import { StoryClaimsSchema } from "./story.ts";
import { SupplementaryDocsSchema } from "./supplementary.ts";

/** Typed aggregate of all Phase 2 extractor outputs. */
export const ExtractionsSchema = z
  .object({
    extractCreatorIdDoc: CreatorIdSchema.optional(),
    extractBankStatement: BankStatementSchema.optional(),
    extractCategoryDocs: CategoryDocsSchema.optional(),
    extractStoryClaims: StoryClaimsSchema.optional(),
    extractSupplementaryDocs: SupplementaryDocsSchema.optional(),
  })
  .strict();
