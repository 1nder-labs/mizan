import { z } from "zod";

export const StoryClaimSchema = z.object({
  claim: z.string(),
  supporting_text_snippet: z.string(),
  plausibility_score: z.number(),
});

/** Claims extracted from the campaign story text. */
export const StoryClaimsSchema = z.object({
  claims: z.array(StoryClaimSchema),
  confidence: z.number(),
});
