/**
 * Compile-time contract snapshot for the Hono RPC tree consumed by
 * `apps/web`. `Equal<A, B>` checks that both sides are structurally
 * identical — not just one being a subtype of the other — so any
 * worker route drift in EITHER direction (added or removed field) causes
 * a compile error before runtime tests catch it.
 *
 * No runtime assertions; the test body guards against the snapshot being
 * tree-shaken out of the typecheck graph.
 */
import { describe, expect, test } from "bun:test";
import { hc } from "hono/client";
import type { InferResponseType } from "hono/client";
import type { AppType } from "@mizan/shared/app-type";
import type { CaseDetailResponse, QueueResponse } from "@mizan/shared";

/** Structural identity check: true only when A and B are exactly the same type. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const client = hc<AppType>("/api");

type WireQueueList = InferResponseType<typeof client.cases.$get>;
type WireCaseDetail = InferResponseType<(typeof client.cases)[":id"]["$get"]>;

/**
 * Asserts that the wire queue-list response carries EXACTLY
 * `{ cases, page, pageSize, total }` — no more, no fewer fields.
 */
const _queueListExact: Equal<WireQueueList, QueueResponse> = true;

/**
 * Asserts that the wire case-detail response carries EXACTLY
 * `{ case, brief }` — no more, no fewer fields.
 */
const _caseDetailExact: Equal<WireCaseDetail, CaseDetailResponse> = true;

describe("AppType contract snapshot", () => {
  test("queue-list wire type matches QueueResponse exactly", () => {
    expect(_queueListExact).toBe(true);
  });

  test("case-detail wire type matches CaseDetailResponse exactly", () => {
    expect(_caseDetailExact).toBe(true);
  });
});
