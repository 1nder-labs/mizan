import { makeExtractor } from "./shared/makeExtractor.ts";
import { CategoryDocsSchema } from "../schemas/extractions/category-docs.ts";
import { toDocumentPart } from "../util/image-format.ts";

export const extractCategoryDocs = makeExtractor({
  name: "extractCategoryDocs",
  schema: CategoryDocsSchema,
  modelKind: "extract",
  buildPrompt: async (caseRow, env) => {
    const obj = await env.R2_BUCKET.get(caseRow.r2_keys.category_doc);
    if (!obj) throw new Error(`category doc missing for case ${caseRow.id}`);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const category = caseRow.claimed_zakat_category ?? caseRow.category;
    return {
      system:
        `Extract structured fields from the ${category} supporting document. ` +
        "Also assess the image's authenticity: set `image_authenticity.ai_generated_likelihood` " +
        "(low/medium/high/very_high) for how likely the document image is AI-generated or " +
        "synthetic, `shows_tampering_signs` if you see editing/manipulation (inconsistent fonts, " +
        "misaligned fields, altered totals, cloning), and a one-sentence `assessment`.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Category: ${category}. Extract supporting evidence.` },
            toDocumentPart(bytes),
          ],
        },
      ],
    };
  },
  mergeInto: (inputData, extracted) => ({
    ...inputData,
    extractions: { ...inputData.extractions, extractCategoryDocs: extracted },
  }),
});
