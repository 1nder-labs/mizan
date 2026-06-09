import { describe, expect, it } from "bun:test";
import { composePhotoSignalPayload } from "@mizan/mastra/testing";

const REVERSE_EMPTY = { hits: [], checked_at: "2026-05-23T00:00:00.000Z" };
const REVERSE_HIT = {
  hits: [{ url: "https://example.com/match", confidence: 0.72 }],
  checked_at: "2026-05-23T00:00:00.000Z",
};
const AI_LOW = { probability: "low" as const, model: "stub-v1" };
const AI_HIGH = { probability: "very_high" as const, model: "stub-v1" };

/**
 * `composePhotoSignalPayload` is pure: a positional rearrangement of
 * four stub outputs into the persisted `PhotoSignalPayload` shape.
 * Pinning the mapping prevents a silent field-shuffle regression where
 * `creator_id.reverseImage` and `category_doc.reverseImage` could
 * accidentally swap (a class of bug the workflow integration tests
 * would catch only by examining persisted payload contents).
 */
describe("composePhotoSignalPayload", () => {
  it("places each stub output in its expected slot", () => {
    const payload = composePhotoSignalPayload({
      creatorIdReverse: REVERSE_EMPTY,
      creatorIdAiGen: AI_LOW,
      categoryDocReverse: REVERSE_HIT,
      categoryDocAiGen: AI_HIGH,
    });
    expect(payload.creator_id.reverseImage).toBe(REVERSE_EMPTY);
    expect(payload.creator_id.aiGen).toBe(AI_LOW);
    expect(payload.category_doc.reverseImage).toBe(REVERSE_HIT);
    expect(payload.category_doc.aiGen).toBe(AI_HIGH);
  });

  it("does not cross-wire creator and category reverse-image results", () => {
    const payload = composePhotoSignalPayload({
      creatorIdReverse: REVERSE_HIT,
      creatorIdAiGen: AI_HIGH,
      categoryDocReverse: REVERSE_EMPTY,
      categoryDocAiGen: AI_LOW,
    });
    expect(payload.creator_id.reverseImage.hits).toHaveLength(1);
    expect(payload.category_doc.reverseImage.hits).toHaveLength(0);
  });

  it("does not cross-wire creator and category aiGen results", () => {
    const payload = composePhotoSignalPayload({
      creatorIdReverse: REVERSE_EMPTY,
      creatorIdAiGen: AI_HIGH,
      categoryDocReverse: REVERSE_EMPTY,
      categoryDocAiGen: AI_LOW,
    });
    expect(payload.creator_id.aiGen.probability).toBe("very_high");
    expect(payload.category_doc.aiGen.probability).toBe("low");
  });
});
