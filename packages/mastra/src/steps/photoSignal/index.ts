import { createStep } from "@mastra/core/workflows";
import { loadCaseContext } from "../../runtime/case-loader.ts";
import { getEnv } from "../../runtime/context-accessors.ts";
import { PartialBriefStateSchema } from "../../schemas/brief.ts";
import { mockAiGenDetection } from "../../tools/ai-gen-mock.ts";
import { mockReverseImageSearch } from "../../tools/reverse-image-mock.ts";
import { upsertSignal } from "../shared/upsertSignal.ts";
import { composePhotoSignalPayload } from "./helpers.ts";

/** Runs deterministic photo mocks and persists a `photo_dup` signal row. */
export const photoSignal = createStep({
  id: "photoSignal",
  inputSchema: PartialBriefStateSchema,
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData, requestContext }) => {
    const env = getEnv(requestContext);
    const caseRow = await loadCaseContext(env, inputData.caseId);
    const [creatorReverse, creatorAiGen, categoryReverse, categoryAiGen] = await Promise.all([
      mockReverseImageSearch({ r2_key: caseRow.r2_keys.creator_id }),
      mockAiGenDetection({ r2_key: caseRow.r2_keys.creator_id }),
      mockReverseImageSearch({ r2_key: caseRow.r2_keys.category_doc }),
      mockAiGenDetection({ r2_key: caseRow.r2_keys.category_doc }),
    ]);
    const payload = composePhotoSignalPayload({
      creatorIdReverse: creatorReverse,
      creatorIdAiGen: creatorAiGen,
      categoryDocReverse: categoryReverse,
      categoryDocAiGen: categoryAiGen,
    });
    await upsertSignal(env, inputData.caseId, inputData.runId, "photo_dup", payload);
    return {
      ...inputData,
      signals: { ...inputData.signals, photo: payload },
    };
  },
});
