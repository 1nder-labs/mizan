import { makeExtractor } from "./shared/makeExtractor.ts";
import { CreatorIdSchema } from "../schemas/extractions/creator-id.ts";
import { toDocumentPart } from "../util/image-format.ts";

export const extractCreatorIdDoc = makeExtractor({
  name: "extractCreatorIdDoc",
  schema: CreatorIdSchema,
  modelKind: "extract",
  buildPrompt: async (caseRow, env) => {
    const obj = await env.R2_BUCKET.get(caseRow.r2_keys.creator_id);
    if (!obj) throw new Error(`creator-id doc missing for case ${caseRow.id}`);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return {
      system:
        "Extract structured fields from the creator government-issued ID. " +
        "Also assess the image's authenticity: set `image_authenticity.ai_generated_likelihood` " +
        "(low/medium/high/very_high) for how likely the image is AI-generated or synthetic, " +
        "`shows_tampering_signs` if you see editing/manipulation (inconsistent fonts, misaligned " +
        "fields, cloning, mismatched lighting), and a one-sentence `assessment`.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Organizer name on the campaign: ${caseRow.organizer_name}. Extract.`,
            },
            toDocumentPart(bytes),
          ],
        },
      ],
    };
  },
  mergeInto: (inputData, extracted) => ({
    ...inputData,
    extractions: { ...inputData.extractions, extractCreatorIdDoc: extracted },
  }),
});
