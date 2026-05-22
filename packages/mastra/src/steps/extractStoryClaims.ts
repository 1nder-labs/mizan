import { makeExtractor } from "./shared/makeExtractor.ts";
import { StoryClaimsSchema } from "../schemas/extractions/story.ts";

export const extractStoryClaims = makeExtractor({
  name: "extractStoryClaims",
  schema: StoryClaimsSchema,
  modelKind: "extract",
  buildPrompt: async (caseRow) => ({
    system: "Extract structured claims from the campaign story text.",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: caseRow.story }],
      },
    ],
  }),
  mergeInto: (inputData, extracted) => ({
    ...inputData,
    extractions: { ...inputData.extractions, extractStoryClaims: extracted },
  }),
});
