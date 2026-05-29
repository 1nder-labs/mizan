/**
 * Runtime validation tests for `LiveEventRowSchema` wire payloads.
 */

import { describe, expect, it } from "bun:test";
import { LiveEventRowSchema } from "@mizan/shared";

const BASE_ROW = {
  topic: "org:org-001",
  seq: 1,
  emitted_at: 1_700_000_000_000,
  actor_user_id: "user-actor",
  organization_id: "org-001",
} as const;

describe("LiveEventRowSchema", () => {
  it("accepts case.status_changed with matching payload", () => {
    const result = LiveEventRowSchema.parse({
      ...BASE_ROW,
      event_type: "case.status_changed",
      payload: {
        event_type: "case.status_changed",
        case_id: "case-001",
        from_status: "DRAFT",
        to_status: "QUEUED",
      },
    });
    expect(result.event_type).toBe("case.status_changed");
    expect(result.payload.event_type).toBe("case.status_changed");
  });

  it("accepts case.assigned with matching payload", () => {
    const result = LiveEventRowSchema.parse({
      ...BASE_ROW,
      topic: "user:user-002",
      event_type: "case.assigned",
      payload: {
        event_type: "case.assigned",
        case_id: "case-001",
        assigned_to: "user-002",
        actor_user_id: "user-actor",
        actor_email: "actor@test.local",
      },
    });
    expect(result.payload.event_type).toBe("case.assigned");
  });

  it("accepts audit.new with matching payload", () => {
    const result = LiveEventRowSchema.parse({
      ...BASE_ROW,
      event_type: "audit.new",
      payload: {
        event_type: "audit.new",
        case_id: "case-001",
        action_id: "550e8400-e29b-41d4-a716-446655440000",
        reviewer_id: "user-reviewer",
      },
    });
    expect(result.payload.event_type).toBe("audit.new");
  });

  it("rejects invalid top-level event_type", () => {
    expect(() =>
      LiveEventRowSchema.parse({
        ...BASE_ROW,
        event_type: "not.a.real.event",
        payload: {
          event_type: "audit.new",
          case_id: "case-001",
          action_id: "550e8400-e29b-41d4-a716-446655440000",
          reviewer_id: "user-reviewer",
        },
      }),
    ).toThrow();
  });

  it("rejects unknown top-level keys in strict mode", () => {
    expect(() =>
      LiveEventRowSchema.parse({
        ...BASE_ROW,
        event_type: "audit.new",
        payload: {
          event_type: "audit.new",
          case_id: "case-001",
          action_id: "550e8400-e29b-41d4-a716-446655440000",
          reviewer_id: "user-reviewer",
        },
        extra: "field",
      }),
    ).toThrow();
  });

  it("rejects invalid case status in status_changed payload", () => {
    expect(() =>
      LiveEventRowSchema.parse({
        ...BASE_ROW,
        event_type: "case.status_changed",
        payload: {
          event_type: "case.status_changed",
          case_id: "case-001",
          from_status: "DRAFT",
          to_status: "NOT_A_STATUS",
        },
      }),
    ).toThrow();
  });

  it("rejects missing required audit.new fields", () => {
    expect(() =>
      LiveEventRowSchema.parse({
        ...BASE_ROW,
        event_type: "audit.new",
        payload: {
          event_type: "audit.new",
          case_id: "case-001",
          reviewer_id: "user-reviewer",
        },
      }),
    ).toThrow();
  });
});
