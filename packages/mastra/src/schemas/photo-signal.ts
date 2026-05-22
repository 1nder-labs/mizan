import { z } from "zod";
import { AiGenResultSchema } from "../tools/ai-gen-stub.ts";
import { ReverseImageResultSchema } from "../tools/reverse-image-stub.ts";

const PhotoAssetSignalSchema = z.object({
  reverseImage: ReverseImageResultSchema,
  aiGen: AiGenResultSchema,
});

/** Structured photo trust signal for creator ID + category document images. */
export const PhotoSignalPayloadSchema = z.object({
  creator_id: PhotoAssetSignalSchema,
  category_doc: PhotoAssetSignalSchema,
});

export type PhotoSignalPayload = z.infer<typeof PhotoSignalPayloadSchema>;
