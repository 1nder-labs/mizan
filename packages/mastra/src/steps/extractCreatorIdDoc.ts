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
        "Extract structured fields from the creator government-issued ID. Set " +
        "`matches_organizer_name` to whether the ID identifies the SAME PERSON as the claimed " +
        "organizer — judge identity, not spelling, so transliteration, romanization, name order, " +
        "and a dropped middle name still count as the same person — and " +
        '`organizer_name_match_reason` to a one-line reason for that call (e.g. "same person, ' +
        'spelling variant" or "different individual — unrelated name"). ' +
        "Then rate `image_authenticity`. `authenticity_risk` (low/medium/high/very_high) is how " +
        "likely this is NOT a genuine ID, judged against what a real ID of its type should show — " +
        "a clear photograph of the holder, consistent typography and layout, and the expected " +
        "identity/security elements (e.g. a passport's machine-readable zone). Raise the risk for " +
        "things a real ID would not have: a blank or placeholder where the photo should be, " +
        "missing or garbled machine-readable data, absent security features, specimen / sample / " +
        "template markings, AI-generation artifacts, or inconsistent fonts, alignment, lighting, " +
        "or cloning. A clean, ordinary scan or photo of a real ID is low risk. Set " +
        "`shows_tampering_signs` only for post-hoc edits of an otherwise-real document, and give " +
        "a one-sentence `assessment` citing the concrete observations behind the rating.",
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
