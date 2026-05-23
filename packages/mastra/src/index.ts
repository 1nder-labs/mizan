/**
 * `@mizan/mastra` barrel — per-request Mastra factory + public re-exports.
 *
 * Returns `MizanMastraBundle` (Mastra instance + a `flush` closure that
 * drains the Langfuse exporter when configured) instead of the raw Mastra
 * instance, because Cloudflare Workers need an explicit drain step in
 * `executionCtx.waitUntil(...)` before the isolate is reclaimed.
 *
 * Observability uses `@mastra/langfuse` — the official Mastra-native
 * Langfuse exporter. The earlier `@vercel/otel` + `langfuse-vercel` wiring
 * targeted plain AI-SDK apps and bypassed Mastra's workflow-aware span
 * propagation; this rewiring brings every step + tool span into the same
 * trace tree automatically.
 */

import { Mastra } from "@mastra/core";
import { D1Store } from "@mastra/cloudflare-d1";
import { Observability } from "@mastra/observability";
import type { CloudflareBindings } from "@mizan/worker/env";
import { buildLangfuseExporter, LangfuseExporter } from "./observability/langfuse.ts";
import { briefWorkflow } from "./workflows/brief.workflow.ts";

export type { BriefStreamPart } from "./schemas/stream.ts";
export {
  BriefPayloadSchema,
  CaseOverlaySchema,
  DraftedOrganizerMessageSchema,
  GeographyTierSchema,
  PhotoSignalPayloadSchema,
  PolicyCitationSchema,
  StoryCoherencePayloadSchema,
  VerificationPathSchema,
  VouchingChainSchema,
  assertCommunityVouchingCorroborated,
  assertPartnerOrgCorroborated,
  assertVouchingChain,
  type BriefPayload,
  type CaseOverlay,
  type DraftedOrganizerMessage,
  type GeographyTier,
  type PhotoSignalPayload,
  type PolicyCitation,
  type StoryCoherencePayload,
  type VerificationPath,
  type VouchingChain,
} from "@mizan/shared";
/*
 * Public predicates — usable by routes, eval harnesses, and future agent
 * surfaces. Test-only step internals (assertGateInputs, mergeParallelSignals,
 * escalateBriefProjection, buildDraftPrompt, decideDraftAction, stubs,
 * SeedCaseSchema) live on the `@mizan/mastra/testing` entry point.
 */
export {
  deriveVerificationPath,
  DOCUMENTARY_MIN_CONFIDENCE,
} from "./steps/computeVerificationPath.ts";
export { forceEscalate } from "./steps/forcedEscalateGate/predicate.ts";
export type { PartialBriefState } from "./schemas/partial-brief-state.ts";
export { CorpusSchema, ClauseSchema, type Corpus, type Clause } from "./schemas/corpus.ts";
export { allCorpusClauseIds, loadPolicyCorpora } from "./corpus/load.ts";
export { chunkCorpusRecords, type ChunkRecord } from "./corpus/chunk.ts";
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
export {
  buildPolicyQuery,
  parseMatchToCitation,
  resolveExcerptMap,
  resolvePolicySource,
} from "./steps/matchPolicy/helpers.ts";
export {
  applyCitationFilter,
  buildClauseIdSchema,
  buildPromptWithClauses,
} from "./steps/composeBrief/helpers.ts";

export interface MizanMastraBundle {
  readonly mastra: Mastra;
  readonly langfuse: LangfuseExporter | null;
}

/**
 * Per-request Mastra instance wired to D1 workflow storage plus the
 * Langfuse exporter when credentials are present.
 *
 * Workers per-request binding rule: the binding handles in `env` are valid
 * only for the lifetime of the current request, so the Mastra instance + the
 * exporter that owns those handles must also be per-request. The returned
 * `langfuse` exporter is the same instance Mastra is observing through, so
 * the route handler passes it directly to `flushLangfuse(...)`.
 */
export function createMastra(env: CloudflareBindings): MizanMastraBundle {
  const langfuse = buildLangfuseExporter(env);
  const observability = langfuse
    ? new Observability({
        configs: {
          langfuse: {
            serviceName: "mizan",
            exporters: [langfuse],
          },
        },
      })
    : undefined;
  const mastra = new Mastra({
    storage: new D1Store({ id: "mizan-mastra", binding: env.DB }),
    workflows: { brief: briefWorkflow },
    ...(observability ? { observability } : {}),
  });
  return { mastra, langfuse };
}
