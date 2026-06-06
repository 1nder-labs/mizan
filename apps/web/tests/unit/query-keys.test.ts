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

  test("cases.lists is the list prefix and does NOT prefix-match detail/notes", () => {
    expect(queryKeys.cases.lists).toEqual(["cases", "list"]);
    const lists = queryKeys.cases.lists;
    const startsWith = (key: readonly unknown[]) => lists.every((part, i) => key[i] === part);
    expect(startsWith(queryKeys.cases.list(DEFAULT_QUEUE_SEARCH))).toBe(true);
    expect(startsWith(queryKeys.cases.detail("abc-123"))).toBe(false);
    expect(startsWith(queryKeys.cases.notes("abc-123"))).toBe(false);
  });

  test("portal.notes has its own root so campaign(id) does not prefix-match it", () => {
    expect(queryKeys.portal.notes("c1")).toEqual(["portal", "notes", "c1"]);
    const campaign = queryKeys.portal.campaign("c1");
    const notes = queryKeys.portal.notes("c1");
    const campaignPrefixMatchesNotes = campaign.every((part, i) => notes[i] === part);
    expect(campaignPrefixMatchesNotes).toBe(false);
  });

  test("audit.all key is stable", () => {
    expect(queryKeys.audit.all).toEqual(["audit"]);
  });
});
