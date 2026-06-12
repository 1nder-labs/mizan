import { createStep } from "@mastra/core/workflows";
import type { ExifSummary } from "@mizan/shared";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import { parseExif } from "../../util/exif.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { UNASSESSED_AUTHENTICITY, composePhotoSignalPayload } from "./helpers.ts";

/** Reads + parses real EXIF from one R2 object; empty (no metadata) when absent. */
async function readExif(env: ReturnType<typeof getEnv>, key: string): Promise<ExifSummary> {
  const obj = await env.R2_BUCKET.get(key);
  if (!obj) return parseExif(new Uint8Array(0));
  return parseExif(new Uint8Array(await obj.arrayBuffer()));
}

/**
 * Image-authenticity signal. REAL, no stubs:
 *   - `authenticity` is the vision LLM's read of each document image, produced by
 *     the SAME extraction call that already passed the image to the model (no
 *     extra LLM call) — carried in `state.extractions.*.image_authenticity`.
 *   - `exif` is parsed from the raw R2 bytes (`util/exif.ts`); genuine camera
 *     photos carry make/model/timestamp/GPS, while PDFs, scans, and synthetic
 *     images honestly report no capture metadata.
 *
 * Note for synthetic / generated corpora: a competent assessment rates generated
 * documents as generated and finds no EXIF — this signal is honest but a weak
 * discriminator there; identity (OCR), story, and vouching carry the separation.
 */
export const photoSignal = createStep({
  id: "photoSignal",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    abortSignal?.throwIfAborted();
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const [creatorExif, categoryExif] = await Promise.all([
      readExif(env, caseRow.r2_keys.creator_id),
      readExif(env, caseRow.r2_keys.category_doc),
    ]);
    abortSignal?.throwIfAborted();
    const extractions = inputData.extractions;
    const payload = composePhotoSignalPayload({
      creatorAuthenticity:
        extractions?.extractCreatorIdDoc?.image_authenticity ?? UNASSESSED_AUTHENTICITY,
      creatorExif,
      categoryAuthenticity:
        extractions?.extractCategoryDocs?.image_authenticity ?? UNASSESSED_AUTHENTICITY,
      categoryExif,
    });
    await upsertSignal({
      env,
      caseId: inputData.caseId,
      runId: inputData.runId,
      signalType: "photo_dup",
      payload,
    });
    return {
      ...inputData,
      signals: { ...inputData.signals, photo: payload },
    };
  },
});
