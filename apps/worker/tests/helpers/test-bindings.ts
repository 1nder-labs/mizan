import type {
  D1Database,
  Fetcher,
  KVNamespace,
  Queue,
  R2Bucket,
  VectorizeIndex,
} from "@cloudflare/workers-types";
import type { CloudflareBindings } from "../../src/env.ts";

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

export function makeStubBindings(overrides: Partial<CloudflareBindings> = {}): CloudflareBindings {
  return {
    ...STUB_BINDINGS,
    DEFAULT_LLM_PROVIDER: "anthropic",
    LANGFUSE_HOST: "",
    ...overrides,
  };
}
