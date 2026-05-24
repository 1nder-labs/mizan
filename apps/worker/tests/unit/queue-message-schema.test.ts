import { describe, expect, it } from "bun:test";
import { BriefQueueMessageSchema, type BriefQueueMessage } from "@mizan/shared";

const VALID_MESSAGE = {
  caseId: "11111111-1111-4111-8111-111111111101",
  runId: "22222222-2222-4222-8222-222222222201",
  enqueuedAt: 1_700_000_000_000,
  requestedBy: "33333333-3333-4333-8333-333333333301",
} satisfies BriefQueueMessage;

describe("BriefQueueMessageSchema", () => {
  it("rejects extra properties via strict()", () => {
    const result = BriefQueueMessageSchema.safeParse({ ...VALID_MESSAGE, extra: true });
    expect(result.success).toBe(false);
  });

  it("rejects malformed caseId", () => {
    const result = BriefQueueMessageSchema.safeParse({ ...VALID_MESSAGE, caseId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects zero or negative enqueuedAt", () => {
    expect(BriefQueueMessageSchema.safeParse({ ...VALID_MESSAGE, enqueuedAt: 0 }).success).toBe(
      false,
    );
    expect(BriefQueueMessageSchema.safeParse({ ...VALID_MESSAGE, enqueuedAt: -1 }).success).toBe(
      false,
    );
  });

  it("accepts a well-formed message", () => {
    const parsed = BriefQueueMessageSchema.parse(VALID_MESSAGE);
    expect(parsed).toEqual(VALID_MESSAGE);
  });

  it("accepts a nanoid-style requestedBy", () => {
    const result = BriefQueueMessageSchema.safeParse({
      ...VALID_MESSAGE,
      requestedBy: "abc123XYZ_-789",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty-string requestedBy", () => {
    const result = BriefQueueMessageSchema.safeParse({ ...VALID_MESSAGE, requestedBy: "" });
    expect(result.success).toBe(false);
  });
});
