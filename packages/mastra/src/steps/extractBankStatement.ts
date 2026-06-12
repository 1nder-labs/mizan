import { makeExtractor } from "./shared/makeExtractor.ts";
import { BankStatementSchema } from "../schemas/extractions/bank-statement.ts";
import { toDocumentPart } from "../util/image-format.ts";

export const extractBankStatement = makeExtractor({
  name: "extractBankStatement",
  schema: BankStatementSchema,
  modelKind: "extract",
  buildPrompt: async (caseRow, env) => {
    const obj = await env.R2_BUCKET.get(caseRow.r2_keys.bank_statement);
    if (!obj) throw new Error(`bank statement missing for case ${caseRow.id}`);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return {
      system:
        "Extract structured fields from the organizer bank statement. Set " +
        "`matches_organizer_name` to whether the account holder is the SAME PERSON as the claimed " +
        "organizer — judge identity, not spelling (transliteration, romanization, name order, and " +
        "a dropped middle name still count) — and `organizer_name_match_reason` to a one-line " +
        "reason for that call.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Claimed organizer: ${caseRow.organizer_name}. Extract account holder and balance fields.`,
            },
            toDocumentPart(bytes),
          ],
        },
      ],
    };
  },
  mergeInto: (inputData, extracted) => ({
    ...inputData,
    extractions: { ...inputData.extractions, extractBankStatement: extracted },
  }),
});
