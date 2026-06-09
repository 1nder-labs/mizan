/**
 * Runtime validation tests for `ViewerContextSchema` strict mode.
 */

import { describe, expect, it } from "bun:test";
import { ViewerContextSchema } from "@mizan/shared";

describe("ViewerContextSchema", () => {
  it("accepts a valid viewer context", () => {
    const result = ViewerContextSchema.parse({
      userId: "user-001",
      role: "admin",
      organizationId: "org-001",
    });
    expect(result).toEqual({
      userId: "user-001",
      role: "admin",
      organizationId: "org-001",
    });
  });

  it("rejects extra keys in strict mode", () => {
    expect(() =>
      ViewerContextSchema.parse({
        userId: "user-001",
        role: "reviewer",
        organizationId: "org-001",
        email: "extra@test.local",
      }),
    ).toThrow();
  });

  it("rejects invalid role values", () => {
    expect(() =>
      ViewerContextSchema.parse({
        userId: "user-001",
        role: "superadmin",
        organizationId: "org-001",
      }),
    ).toThrow();
  });
});
