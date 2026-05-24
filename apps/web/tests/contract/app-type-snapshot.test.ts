/**
 * Compile-time contract snapshot. The `satisfies` assertions below
 * pin the shape of the Hono RPC tree consumed by `apps/web`. If a
 * worker route changes its response shape, this file fails to compile
 * — surfacing the drift before runtime tests catch it.
 *
 * No runtime assertions; the test body just guards against the
 * snapshot file being tree-shaken out of the typecheck graph.
 */
import { describe, expect, test } from "bun:test";
import { hc } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { AppType } from "@mizan/worker/index";

const client = hc<AppType>("/api");

type QueueListResponse = InferResponseType<typeof client.cases.$get>;
type CaseDetailResponse = InferResponseType<(typeof client.cases)[":id"]["$get"]>;

const queueListShape = {
  cases: [] as QueueListResponse extends { cases: infer T } ? T : never,
  page: 1,
  pageSize: 25,
  total: 0,
} satisfies Partial<QueueListResponse>;

const caseDetailShape = {
  case: null,
  brief: null,
} satisfies {
  case: CaseDetailResponse extends { case: infer T } ? T | null : never;
  brief: CaseDetailResponse extends { brief: infer T } ? T : never;
};

describe("AppType contract snapshot", () => {
  test("queue-list response carries cases / page / pageSize / total", () => {
    expect(queueListShape.page).toBe(1);
    expect(queueListShape.pageSize).toBe(25);
  });

  test("case-detail response carries case + brief", () => {
    expect(caseDetailShape.brief).toBeNull();
  });
});
