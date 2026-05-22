/**
 * Runtime validation tests for drizzle-zod refinements and custom schemas.
 *
 * These tests confirm that the `.parse()` calls throw (validation error) or
 * succeed for the expected inputs — covering the custom refinements added in
 * `packages/db/src/zod.ts`.
 *
 * `expect(() => schema.parse(...)).toThrow()` is the idiomatic vitest pattern
 * for zod 4 parse errors (throws a `ZodError`).
 */

import { describe, expect, it } from "bun:test";
import {
  EchoSchema,
  ReviewerActionSchema,
  insertBriefsSchema,
  insertCasesSchema,
  insertReviewerActionsSchema,
} from "@mizan/db";

describe("insertCasesSchema refinements", () => {
  it("throws when category is empty string (min:1)", () => {
    expect(() =>
      insertCasesSchema.parse({
        category: "",
        geography: "US",
        created_by: "user-id-abc",
      }),
    ).toThrow();
  });

  it("succeeds with valid minimal case payload", () => {
    const result = insertCasesSchema.parse({
      category: "zakat",
      geography: "US",
      created_by: "user-id-abc",
    });
    expect(result.category).toBe("zakat");
  });
});

describe("insertBriefsSchema refinements", () => {
  it("throws when confidence exceeds 100 (max:100)", () => {
    expect(() =>
      insertBriefsSchema.parse({
        case_id: "case-id-1",
        run_id: "run-id-1",
        recommendation: "READY_FOR_REVIEW",
        confidence: 200,
        payload_json: {},
      }),
    ).toThrow();
  });

  it("throws when confidence is negative (min:0)", () => {
    expect(() =>
      insertBriefsSchema.parse({
        case_id: "case-id-1",
        run_id: "run-id-1",
        recommendation: "READY_FOR_REVIEW",
        confidence: -1,
        payload_json: {},
      }),
    ).toThrow();
  });
});

describe("insertReviewerActionsSchema refinements", () => {
  it("throws when rationale is empty string (min:1)", () => {
    expect(() =>
      insertReviewerActionsSchema.parse({
        case_id: "case-id-1",
        run_id: "run-id-1",
        reviewer_id: "reviewer-1",
        action: "APPROVE",
        rationale: "",
        action_id: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow();
  });
});

describe("ReviewerActionSchema", () => {
  it("throws when action_id is not a UUID", () => {
    expect(() =>
      ReviewerActionSchema.parse({
        action: "APPROVE",
        rationale: "looks good",
        action_id: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("succeeds with a valid action payload", () => {
    const result = ReviewerActionSchema.parse({
      action: "ESCALATE",
      rationale: "Needs higher review",
      action_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.action).toBe("ESCALATE");
  });
});

describe("EchoSchema", () => {
  it("throws when message is empty string (min:1)", () => {
    expect(() =>
      EchoSchema.parse({
        message: "",
        action_id: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow();
  });

  it("succeeds with valid echo payload", () => {
    const result = EchoSchema.parse({
      message: "hello world",
      action_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.message).toBe("hello world");
  });
});
