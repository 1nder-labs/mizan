import { describe, expect, test } from "bun:test";
import { LoginSchema } from "@mizan/shared";

describe("LoginSchema", () => {
  test("accepts a valid email + 8-char password", () => {
    const result = LoginSchema.safeParse({ email: "reviewer@launchgood.com", password: "12345678" });
    expect(result.success).toBe(true);
  });

  test("rejects malformed email", () => {
    const result = LoginSchema.safeParse({ email: "not-an-email", password: "12345678" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "email")).toBe(true);
    }
  });

  test("rejects password shorter than 8 chars", () => {
    const result = LoginSchema.safeParse({ email: "reviewer@launchgood.com", password: "1234567" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "password")).toBe(true);
    }
  });

  test("rejects extra fields under .strict()", () => {
    const result = LoginSchema.safeParse({
      email: "reviewer@launchgood.com",
      password: "12345678",
      extra: "nope",
    });
    expect(result.success).toBe(false);
  });
});
