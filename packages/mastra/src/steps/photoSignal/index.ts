import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/partial-brief-state.ts";
import { aiGenStub } from "../../tools/ai-gen-stub.ts";
import { reverseImageStub } from "../../tools/reverse-image-stub.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { composePhotoSignalPayload } from "./helpers.ts";

/**
 * Runs deterministic photo stubs and persists a `photo_dup` signal row.
 *
 * Stub calls are salted with the case_id so an attacker who controls
 * r2_key naming cannot brute-force a clean signal (the same `r2_key`
 * under a different `case_id` produces a different deterministic value).
 *
 * `abortSignal` is forwarded by checking `aborted` before the stub
 * Promise.all and immediately after — matching the cancel contract of
 * `makeLlmSignalStep` and `makeExtractor`. The stubs themselves are
 * synchronous-ish placeholders, but downstream Phase-N work that swaps
 * them for real network-backed lookups (reverse-image API, AI-gen
 * classifier) must inherit cancel semantics without re-plumbing.
 */
export const photoSignal = createStep({
  id: "photoSignal",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext, abortSignal }) => {
    const env = getEnv(requestContext);
    abortSignal?.throwIfAborted();
    const caseRow = await loadCaseContext(env, inputData.caseId);
    abortSignal?.throwIfAborted();
    const salt = inputData.caseId;
    const [creatorReverse, creatorAiGen, categoryReverse, categoryAiGen] = await Promise.all([
      reverseImageStub({ r2_key: caseRow.r2_keys.creator_id, salt }),
      aiGenStub({ r2_key: caseRow.r2_keys.creator_id, salt }),
      reverseImageStub({ r2_key: caseRow.r2_keys.category_doc, salt }),
      aiGenStub({ r2_key: caseRow.r2_keys.category_doc, salt }),
    ]);
    abortSignal?.throwIfAborted();
    const payload = composePhotoSignalPayload({
      creatorIdReverse: creatorReverse,
      creatorIdAiGen: creatorAiGen,
      categoryDocReverse: categoryReverse,
      categoryDocAiGen: categoryAiGen,
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
