/**
 * Runtime validation tests for drizzle-zod refinements and the
 * shared HTTP-route validation schemas.
 *
 * Confirms that `.parse()` throws on invalid inputs or returns
 * narrowed values on valid inputs — covering the custom refinements
 * declared in `packages/db/src/schemas.ts` and the route-payload
 * schemas in `packages/shared/src/schemas/route-payloads.ts`.
 */

import { describe, expect, it } from "bun:test";
import { insertBriefsSchema, insertCasesSchema, insertReviewerActionsSchema } from "@mizan/db";
import { REVIEWER_ACTION_VALUES } from "@mizan/db";
import { EchoSchema, REVIEWER_ACTION_ENUM, ReviewerActionSchema } from "@mizan/shared";

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

  it("allows APPROVE with empty rationale", () => {
    const result = ReviewerActionSchema.parse({
      action: "APPROVE",
      rationale: "",
      action_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.rationale).toBe("");
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

/**
 * `REVIEWER_ACTION_ENUM` (consumed by `ReviewerActionSchema` in
 * `@mizan/shared`) and `REVIEWER_ACTION_VALUES` (consumed by the
 * Drizzle `reviewer_actions.action` column in `@mizan/db/schema.ts`)
 * must stay synchronised. `@mizan/shared` cannot import from
 * `@mizan/db` without inverting the layering, so the constant lives
 * in two places — this test catches drift the moment it appears.
 */
describe("reviewer action enum parity", () => {
  it("@mizan/shared route enum matches @mizan/db column enum", () => {
    expect([...REVIEWER_ACTION_ENUM]).toEqual([...REVIEWER_ACTION_VALUES]);
  });
});
