import { describe, expect, test } from "bun:test";
import { LoginSchema } from "@mizan/shared";

describe("LoginSchema", () => {
  test("accepts a valid email + 12-char password", () => {
    const result = LoginSchema.safeParse({
      email: "reviewer@launchgood.com",
      password: "CorrectHorse99",
    });
    expect(result.success).toBe(true);
  });

  test("rejects malformed email", () => {
    const result = LoginSchema.safeParse({ email: "not-an-email", password: "CorrectHorse99" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "email")).toBe(true);
    }
  });

  test("rejects password shorter than 12 chars (8-char fails)", () => {
    const result = LoginSchema.safeParse({
      email: "reviewer@launchgood.com",
      password: "12345678",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "password")).toBe(true);
    }
  });

  test("rejects password of exactly 11 chars", () => {
    const result = LoginSchema.safeParse({
      email: "reviewer@launchgood.com",
      password: "12345678901",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "password")).toBe(true);
    }
  });

  test("accepts password of exactly 12 chars", () => {
    const result = LoginSchema.safeParse({
      email: "reviewer@launchgood.com",
      password: "123456789012",
    });
    expect(result.success).toBe(true);
  });

  test("rejects extra fields under .strict()", () => {
    const result = LoginSchema.safeParse({
      email: "reviewer@launchgood.com",
      password: "CorrectHorse99",
      extra: "nope",
    });
    expect(result.success).toBe(false);
  });
});
