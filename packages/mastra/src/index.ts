/**
 * `@mizan/mastra` barrel — per-request Mastra factory + production surface.
 *
 * Returns `MizanMastraBundle` (Mastra instance + Langfuse exporter handle)
 * instead of the raw Mastra instance, because Cloudflare Workers need an
 * explicit drain step in `executionCtx.waitUntil(...)` before the isolate
 * is reclaimed.
 *
 * Observability uses `@mastra/langfuse` — the official Mastra-native
 * exporter, which carries Mastra's workflow-aware span propagation
 * instead of the AI-SDK-flat spans produced by `@vercel/otel`.
 *
 * Surface boundary: this barrel exports what production callers (routes,
 * eval harnesses, future agent surfaces) need — predicates, factories,
 * persisted contracts (re-exported from `@mizan/shared` for ergonomics).
 * Step-internal helpers, persistence wrappers, prompt builders, and the
 * `PartialBriefState` workflow accumulator type live on
 * `@mizan/mastra/testing` so consumers can't accidentally take a
 * dependency on workflow-internal shapes.
 */

export type { BriefStreamPart } from "./schemas/stream.ts";

/**
 * Public predicates — usable by routes, eval harnesses, and future
 * agent surfaces. Step internals (assertGateInputs, mergeParallelSignals,
 * escalateBriefProjection, persistBrief, upsertSignal, prompt builders,
 * stubs, seed schemas, PartialBriefState) live on `@mizan/mastra/testing`.
 */
export {
  deriveVerificationPath,
  DOCUMENTARY_MIN_CONFIDENCE,
} from "./steps/computeVerificationPath.ts";
export { forceEscalate } from "./steps/forcedEscalateGate/predicate.ts";
export { CorpusSchema, ClauseSchema, type Corpus, type Clause } from "./schemas/corpus.ts";
export { allCorpusClauseIds, loadPolicyCorpora } from "./corpus/load.ts";
export { chunkCorpusRecords, type ChunkRecord } from "./corpus/chunk.ts";
export { getClauseById, type ClauseWithMeta, type CorpusSource } from "./corpus/lookup.ts";
export { CreatorIdSchema } from "./schemas/extractions/creator-id.ts";
export { flushLangfuse } from "./observability/flush.ts";
export {
  makeRuntimeContext,
  MIZAN_CTX_KEY,
  type MizanRuntimeContext,
} from "./observability/runtime-context.ts";
export { getEnv, getCtx, MIZAN_ENV_KEY } from "./runtime/context-accessors.ts";
export { makeTelemetry } from "./runtime/telemetry.ts";
export {
  getDefaultModel,
  getModel,
  type LlmProvider,
  type ModelConfig,
  type ModelKind,
} from "./models/factory.ts";
export {
  getEmbeddingModel,
  embedPolicyText,
  embedPolicyTexts,
  type EmbeddingEnv,
} from "./models/embedding-factory.ts";
export {
  resolveBatchEmbeddings,
  resolveLanguageModel,
  resolveQueryEmbedding,
  type ResolvedLanguageModel,
  type ResolveLanguageModelArgs,
} from "./runtime/model-resolver.ts";
export { tierFor } from "./runtime/geography-tier.ts";
export { detectImageMediaType, toImagePart } from "./util/image-format.ts";
export { createMastra, type MizanMastraBundle } from "./mastra-factory.ts";
export { emitWorkflowEvent } from "./observability/workflow-event-logger.ts";
export { promoteEvalRow, type PromoteEvalRowInput } from "./steps/promote-to-eval-helpers.ts";
export {
  createBriefRun,
  buildBriefRunContext,
  type BriefRunBundle,
  type BriefRunContextInput,
} from "./runtime/brief-run-factory.ts";
