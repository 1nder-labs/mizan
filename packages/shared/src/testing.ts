/**
 * `@mizan/shared/testing` — test-only helpers consumed by every
 * workspace's test suite.
 *
 * Today it exposes `makeStubBindings`, the structurally-valid
 * `CloudflareBindings` factory used wherever a test or eval target
 * needs to call into mastra code without spinning a real worker.
 * Keeping the helper in `@mizan/shared/testing` (not in `apps/worker`)
 * means `packages/eval` and any future cross-package test can share
 * one source — avoiding the silent stub duplication Pass 8 flagged.
 *
 * The file is intentionally a separate entrypoint so the production
 * `@mizan/shared` barrel never imports it; tests opt in via
 * `import { … } from "@mizan/shared/testing"`.
 */

import type {
  D1Database,
  Fetcher,
  KVNamespace,
  Queue,
  R2Bucket,
  VectorizeIndex,
} from "@cloudflare/workers-types";
import type { CloudflareBindings } from "./cloudflare-bindings.ts";

const STUB_BINDINGS = {
  DB: {} as D1Database,
  KV: {} as KVNamespace,
  R2_BUCKET: {} as R2Bucket,
  VECTORIZE: {} as VectorizeIndex,
  BRIEF_QUEUE: {} as Queue,
  ASSETS: {} as Fetcher,
} satisfies Pick<
  CloudflareBindings,
  "DB" | "KV" | "R2_BUCKET" | "VECTORIZE" | "BRIEF_QUEUE" | "ASSETS"
>;

/**
 * Builds a structurally-valid `CloudflareBindings` for tests + eval.
 * Pass any subset of `overrides` to swap concrete values in for the
 * stub handles (e.g., the live D1 from `cloudflare:workers`'s `env`).
 */
export function makeStubBindings(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return {
    ...STUB_BINDINGS,
    DEFAULT_LLM_PROVIDER: "anthropic",
    LANGFUSE_HOST: "",
    ...overrides,
  };
}
