import type { z } from "zod";
import type { AiGenResultSchema } from "../../tools/ai-gen-stub.ts";
import type { ReverseImageResultSchema } from "../../tools/reverse-image-stub.ts";
import { type PhotoSignalPayload } from "@mizan/shared";

/** Nests reverse-image + AI-gen stub outputs into the photo signal payload. */
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
