import { makeExtractor } from "./shared/makeExtractor.ts";
import { BankStatementSchema } from "../schemas/extractions/bank-statement.ts";

export const extractBankStatement = makeExtractor({
  name: "extractBankStatement",
  schema: BankStatementSchema,
  model: { provider: "anthropic", model: "claude-haiku-4-5" },
  buildPrompt: async (caseRow, env) => {
    const obj = await env.R2_BUCKET.get(caseRow.r2_keys.bank_statement);
    if (!obj) throw new Error(`bank statement missing for case ${caseRow.id}`);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return {
      system: "Extract structured fields from the organizer bank statement.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract account holder and balance fields." },
            { type: "image", image: bytes, mediaType: "image/png" },
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
