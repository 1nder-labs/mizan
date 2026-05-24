import { z } from "zod";
import { AiGenResultSchema, ReverseImageResultSchema } from "./tool-shapes.ts";

export const PhotoAssetSignalSchema = z
  .object({
    reverseImage: ReverseImageResultSchema,
    aiGen: AiGenResultSchema,
  })
  .strict();

/** Structured photo trust signal for creator ID + category document images. */
export const PhotoSignalPayloadSchema = z
  .object({
    creator_id: PhotoAssetSignalSchema,
    category_doc: PhotoAssetSignalSchema,
  })
  .strict();

export type PhotoAssetSignal = z.infer<typeof PhotoAssetSignalSchema>;
export type PhotoSignalPayload = z.infer<typeof PhotoSignalPayloadSchema>;
