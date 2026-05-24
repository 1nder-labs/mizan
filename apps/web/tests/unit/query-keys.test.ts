import { describe, expect, test } from "bun:test";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { queryKeys } from "../../src/lib/query-keys.ts";

describe("queryKeys", () => {
  test("session key is a frozen tuple", () => {
    expect(queryKeys.session).toEqual(["session"]);
  });

  test("cases.list embeds the search payload", () => {
    expect(queryKeys.cases.list(DEFAULT_QUEUE_SEARCH)).toEqual([
      "cases",
      "list",
      DEFAULT_QUEUE_SEARCH,
    ]);
  });

  test("cases.detail keys by id", () => {
    expect(queryKeys.cases.detail("abc-123")).toEqual(["cases", "detail", "abc-123"]);
  });

  test("audit.all key is stable", () => {
    expect(queryKeys.audit.all).toEqual(["audit"]);
  });
});
