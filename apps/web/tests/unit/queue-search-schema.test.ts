import { describe, expect, test } from "bun:test";
import { DEFAULT_QUEUE_SEARCH, QueueSearchSchema, isCaseStatus } from "@mizan/shared";

describe("QueueSearchSchema", () => {
  test("defaults fall back when URL is empty", () => {
    const parsed = QueueSearchSchema.parse({});
    expect(parsed).toEqual(DEFAULT_QUEUE_SEARCH);
  });

  test("coerces page string to integer", () => {
    const parsed = QueueSearchSchema.parse({ page: "3" });
    expect(parsed.page).toBe(3);
  });

  test(".catch falls back on garbage sort", () => {
    const parsed = QueueSearchSchema.parse({ sort: "garbage" });
    expect(parsed.sort).toBe("updated_desc");
  });

  test(".catch coalesces negative page to 1", () => {
    const parsed = QueueSearchSchema.parse({ page: "-2" });
    expect(parsed.page).toBe(1);
  });

  test(".catch coalesces page above 1000 to 1", () => {
    const parsed = QueueSearchSchema.parse({ page: "2000" });
    expect(parsed.page).toBe(1);
  });

  test("accepts a known status enum value", () => {
    const parsed = QueueSearchSchema.parse({ status: "READY_FOR_REVIEW" });
    expect(parsed.status).toBe("READY_FOR_REVIEW");
  });

  test("drops unknown status via .catch(undefined)", () => {
    const parsed = QueueSearchSchema.parse({ status: "WAT" });
    expect(parsed.status).toBeUndefined();
  });
});

describe("isCaseStatus", () => {
  test("returns true for known values", () => {
    expect(isCaseStatus("READY_FOR_REVIEW")).toBe(true);
    expect(isCaseStatus("DRAFT")).toBe(true);
  });

  test("returns false for unknown values", () => {
    expect(isCaseStatus("WAT")).toBe(false);
    expect(isCaseStatus("")).toBe(false);
  });
});
