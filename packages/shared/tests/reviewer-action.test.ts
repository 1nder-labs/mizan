import { describe, expect, it } from "bun:test";
import { ReviewerActionRequestSchema } from "../src/schemas/reviewer-action.ts";

const ACTION_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("ReviewerActionRequestSchema", () => {
  it("accepts APPROVE with empty rationale", () => {
    const result = ReviewerActionRequestSchema.parse({
      action: "APPROVE",
      rationale: "",
      action_id: ACTION_ID,
    });
    expect(result.action).toBe("APPROVE");
  });

  it("accepts REQUEST_DOCS with empty rationale", () => {
    expect(() =>
      ReviewerActionRequestSchema.parse({
        action: "REQUEST_DOCS",
        rationale: "",
        action_id: ACTION_ID,
      }),
    ).not.toThrow();
  });

  it("accepts ESCALATE with empty rationale", () => {
    expect(() =>
      ReviewerActionRequestSchema.parse({
        action: "ESCALATE",
        rationale: "",
        action_id: ACTION_ID,
      }),
    ).not.toThrow();
  });

  it("rejects OVERRIDE with empty rationale on rationale path", () => {
    const result = ReviewerActionRequestSchema.safeParse({
      action: "OVERRIDE",
      rationale: "",
      action_id: ACTION_ID,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "rationale")).toBe(true);
  });

  it("rejects BLOCK with empty rationale on rationale path", () => {
    const result = ReviewerActionRequestSchema.safeParse({
      action: "BLOCK",
      rationale: "",
      action_id: ACTION_ID,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "rationale")).toBe(true);
  });

  it("accepts OVERRIDE with 8+ char rationale", () => {
    const result = ReviewerActionRequestSchema.parse({
      action: "OVERRIDE",
      rationale: "12345678",
      action_id: ACTION_ID,
    });
    expect(result.rationale).toBe("12345678");
  });

  it("rejects malformed action_id", () => {
    expect(() =>
      ReviewerActionRequestSchema.parse({
        action: "APPROVE",
        rationale: "",
        action_id: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("rejects rationale over 2000 chars (server-side cap)", () => {
    const result = ReviewerActionRequestSchema.safeParse({
      action: "APPROVE",
      rationale: "x".repeat(2_001),
      action_id: ACTION_ID,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "rationale")).toBe(true);
  });
});
