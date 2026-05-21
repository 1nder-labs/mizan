/**
 * Compile-time type assertions for all five domain table select types.
 *
 * `expectTypeOf` is a no-op at runtime — failures surface only when TypeScript
 * compiles this file. The tests run as part of `vitest run` (and also
 * `vitest run --typecheck`) since vitest compiles all included `.ts` files.
 *
 * To get a hard type-checking gate add `--typecheck` to the vitest command, or
 * check via `tsc -p tests/tsconfig.json --noEmit`. Both confirm these
 * assertions at compile time.
 */

import { describe, it } from "bun:test";
import { expectTypeOf } from "expect-type";
import type { Brief, Case, ReviewerAction, Signal } from "@mizan/db";

describe("Case schema shape", () => {
  it("status field carries the 6-value literal union", () => {
    expectTypeOf<Case["status"]>().toEqualTypeOf<
      "DRAFT" | "QUEUED" | "RUNNING" | "SUSPENDED_HITL" | "READY_FOR_REVIEW" | "ACTIONED"
    >();
  });

  it("created_at is typed as Date", () => {
    expectTypeOf<Case["created_at"]>().toEqualTypeOf<Date>();
  });

  it("updated_at is typed as Date", () => {
    expectTypeOf<Case["updated_at"]>().toEqualTypeOf<Date>();
  });
});

describe("Brief schema shape", () => {
  it("confidence is typed as number", () => {
    expectTypeOf<Brief["confidence"]>().toEqualTypeOf<number>();
  });

  it("composed_at is typed as Date", () => {
    expectTypeOf<Brief["composed_at"]>().toEqualTypeOf<Date>();
  });
});

describe("ReviewerAction schema shape", () => {
  it("action is typed as the 5-value literal union", () => {
    expectTypeOf<ReviewerAction["action"]>().toEqualTypeOf<
      "APPROVE" | "ESCALATE" | "REQUEST_DOCS" | "BLOCK" | "OVERRIDE"
    >();
  });

  it("acted_at is typed as Date", () => {
    expectTypeOf<ReviewerAction["acted_at"]>().toEqualTypeOf<Date>();
  });
});

describe("Signal schema shape", () => {
  it("recorded_at is typed as Date", () => {
    expectTypeOf<Signal["recorded_at"]>().toEqualTypeOf<Date>();
  });
});
