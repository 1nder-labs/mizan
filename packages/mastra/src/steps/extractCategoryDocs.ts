import { makeExtractor } from "./shared/makeExtractor.ts";
import { CategoryDocsSchema } from "../schemas/extractions/category-docs.ts";

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
      system: `Extract structured fields from the ${category} supporting document.`,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Category: ${category}. Extract supporting evidence.` },
            { type: "image", image: bytes, mediaType: "image/png" },
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
