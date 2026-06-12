import { createStep } from "@mastra/core/workflows";
import { type DocumentRow, listCaseDocuments, makeDb, SUPPLEMENTARY_DOC_KIND } from "@mizan/db";
import { loadCaseContext } from "../runtime/case-loader.ts";
import { getCtx, getEnv } from "../runtime/context-accessors.ts";
import { PartialBriefStateSchema, type PartialBriefState } from "../schemas/partial-brief-state.ts";
import {
  type SupplementaryDocs,
  SupplementaryDocsSchema,
} from "../schemas/extractions/supplementary.ts";
import {
  runStructuredLlmWithMessages,
  type StructuredLlmMessage,
} from "./shared/runStructuredLlm.ts";
import { toDocumentPart } from "../util/image-format.ts";

const SYSTEM_PROMPT =
  "You are reading the supplementary evidence a campaign organizer attached beyond the three " +
  "required documents (their ID, bank statement, and category document). These are extra " +
  "corroborating materials — invoices, medical bills, insurance statements, letters, receipts. " +
  "For EACH attached document return: `doc_type` (what kind of document it is, e.g. 'hospital " +
  "invoice', 'insurance EOB', 'utility bill'), a one-to-two-sentence `summary` of what it shows " +
  "(amounts, names, dates, issuer), and `supports_campaign_claims` — true only when the document " +
  "concretely corroborates the campaign's stated need, false when it is irrelevant, illegible, or " +
  "contradicts the story. Judge each document on its own contents; do not infer beyond what is " +
  "visible.";

const EMPTY: SupplementaryDocs = { documents: [] };

/** Merges the supplementary read into the shared extractions slot. */
function mergeInto(inputData: PartialBriefState, extracted: SupplementaryDocs): PartialBriefState {
  return {
    ...inputData,
    extractions: { ...inputData.extractions, extractSupplementaryDocs: extracted },
  };
}

/**
 * Fetches each supplementary doc from R2 and builds one captioned user turn. The
 * leading count reflects the documents ACTUALLY attached (R2 blobs that resolve),
 * not the row count — a missing blob is dropped rather than claimed, so the model
 * never sees "3 documents" with two images and infers a third. Returns null when
 * no blob resolved, so the caller skips the LLM entirely.
 */
async function buildMessages(
  env: ReturnType<typeof getEnv>,
  docs: readonly DocumentRow[],
): Promise<readonly StructuredLlmMessage[] | null> {
  const parts: StructuredLlmMessage["content"][number][] = [];
  let attached = 0;
  for (const doc of docs) {
    const obj = await env.R2_BUCKET.get(doc.r2_key);
    if (!obj) continue;
    attached += 1;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    parts.push({ type: "text", text: `Document ${attached} (${doc.filename || "unnamed"}):` });
    parts.push(toDocumentPart(bytes));
  }
  if (attached === 0) return null;
  const content: StructuredLlmMessage["content"][number][] = [
    { type: "text", text: `The organizer attached ${attached} supplementary document(s).` },
    ...parts,
  ];
  return [{ role: "user", content }];
}

/**
 * Extracts the client's supplementary uploads into the brief. Skips the LLM
 * call entirely when the case has no supplementary documents (the common case),
 * so cases with only the three required slots pay nothing. When present, every
 * attached document is summarized so `composeBrief` can credit client-provided
 * evidence instead of flagging it as missing. Loads documents directly (not via
 * `case-loader.r2_keys`, which only tracks the three extraction slots).
 */
export const extractSupplementaryDocs = createStep({
  id: "extractSupplementaryDocs",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal, tracingContext }) => {
    const env = getEnv(requestContext);
    const ctx = getCtx(requestContext);
    abortSignal?.throwIfAborted();
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const all = await listCaseDocuments(makeDb(env.DB), inputData.caseId, caseRow.organization_id);
    const supp = all.filter((d) => d.doc_kind === SUPPLEMENTARY_DOC_KIND);
    if (supp.length === 0) return mergeInto(inputData, EMPTY);
    const messages = await buildMessages(env, supp);
    if (messages === null) return mergeInto(inputData, EMPTY);
    abortSignal?.throwIfAborted();
    const extracted = await runStructuredLlmWithMessages({
      env,
      ctx,
      stepName: "extractSupplementaryDocs",
      schemaName: "extractSupplementaryDocs.extract",
      modelKind: "extract",
      schema: SupplementaryDocsSchema,
      system: SYSTEM_PROMPT,
      messages,
      abortSignal,
      tracingContext,
    });
    return mergeInto(inputData, extracted);
  },
});
