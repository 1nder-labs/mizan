import { z } from "zod";
import { AiGenResultSchema } from "../../tools/ai-gen-mock.ts";
import { ReverseImageResultSchema } from "../../tools/reverse-image-mock.ts";

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

/** Nests reverse-image + AI-gen mock outputs into the photo signal payload. */
export function composePhotoSignalPayload(input: {
  creatorIdReverse: z.infer<typeof ReverseImageResultSchema>;
  creatorIdAiGen: z.infer<typeof AiGenResultSchema>;
  categoryDocReverse: z.infer<typeof ReverseImageResultSchema>;
  categoryDocAiGen: z.infer<typeof AiGenResultSchema>;
}): PhotoSignalPayload {
  return {
    creator_id: {
      reverseImage: input.creatorIdReverse,
      aiGen: input.creatorIdAiGen,
    },
    category_doc: {
      reverseImage: input.categoryDocReverse,
      aiGen: input.categoryDocAiGen,
    },
  };
}
