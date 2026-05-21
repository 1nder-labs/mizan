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
export type { BriefPayload, PolicyCitation } from "./schemas/brief.ts";
export { BriefPayloadSchema, PolicyCitationSchema } from "./schemas/brief.ts";
export { CorpusSchema, ClauseSchema, type Corpus, type Clause } from "./schemas/corpus.ts";
export { allCorpusClauseIds, loadPolicyCorpora } from "./corpus/load.ts";
export { chunkCorpusRecords, type ChunkRecord } from "./corpus/chunk.ts";
export { CaseOverlaySchema } from "./schemas/case-overlay.ts";
export type { CaseOverlay } from "./schemas/case-overlay.ts";
export { CreatorIdSchema } from "./schemas/extractions/creator-id.ts";
export { flushLangfuse } from "./observability/flush.ts";
export {
  makeRuntimeContext,
  MIZAN_CTX_KEY,
  type MizanRuntimeContext,
} from "./observability/runtime-context.ts";
export { getEnv, getCtx, MIZAN_ENV_KEY } from "./runtime/context-accessors.ts";
export { makeTelemetry } from "./runtime/telemetry.ts";
export { getModel, type ModelConfig, type LlmProvider } from "./models/factory.ts";
export {
  getEmbeddingModel,
  embedPolicyText,
  embedPolicyTexts,
} from "./models/embedding-factory.ts";
export { mockProvider, parseMockResponseMap } from "./test/mock-provider.ts";
export {
  case001Responses,
  case002Responses,
  case003Responses,
  case004Responses,
  case005Responses,
  responsesForCaseIndex,
  SEED_CASE_IDS,
  serializeMockResponses,
} from "./test/canned-responses/index.ts";

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
