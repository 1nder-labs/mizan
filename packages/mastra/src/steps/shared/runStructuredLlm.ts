import { generateObject } from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { z } from "zod";
import { resolveLanguageModel } from "../../runtime/model-resolver.ts";
import { makeTelemetry } from "../../runtime/telemetry.ts";
import type { CloudflareBindings } from "@mizan/worker/env";
import type { ModelConfig, ModelKind } from "../../models/factory.ts";
import type { MizanRuntimeContext } from "../../observability/runtime-context.ts";

const MAX_RETRIES = 2;

/**
 * The generic constraint is `z.ZodType<TOutput>` — pinned to a concrete
 * object output — so the AI SDK's `generateObject` overload resolves its
 * RESULT type to `TOutput` directly (instead of leaving it on the
 * "enum vs object vs array" branch where it collapses to `unknown`).
 *
 * `postProcess` runs after the post-parse validation and before the
 * return — it lets callers apply schema-aware projections (e.g.
 * `applyCitationFilter` in composeBrief) without forking the helper.
 */
export interface StructuredLlmInvocation<TOutput> {
  readonly env: CloudflareBindings;
  readonly ctx: MizanRuntimeContext;
  readonly stepName: string;
  readonly schemaName: string;
  readonly modelKind: ModelKind;
  readonly schema: z.ZodType<TOutput>;
  readonly system: string;
  readonly userPayload: string;
  readonly abortSignal: AbortSignal | undefined;
  readonly postProcess?: (parsed: TOutput) => TOutput;
}

/**
 * Wraps the boilerplate every Phase 4 signal/compose step needs around
 * `generateObject`: per-request model resolution, telemetry wiring,
 * retry policy, abort-signal forwarding, and structured-output parsing.
 *
 * Centralising the call shape lets the steps focus on the prompt + result
 * handling and ensures every LLM call site picks up future infrastructure
 * changes (telemetry tags, retry policy, abort plumbing) automatically.
 */
export async function runStructuredLlm<TOutput>(
  invocation: StructuredLlmInvocation<TOutput>,
): Promise<TOutput> {
  const resolved = resolveLanguageModel({ env: invocation.env, kind: invocation.modelKind });
  const generateArgs = buildGenerateArgs(invocation, resolved.model, resolved.config);
  const { object } = await generateObject(
    invocation.abortSignal
      ? { ...generateArgs, abortSignal: invocation.abortSignal }
      : generateArgs,
  );
  const parsed = invocation.schema.parse(object);
  return invocation.postProcess ? invocation.postProcess(parsed) : parsed;
}

function buildGenerateArgs<TOutput>(
  invocation: StructuredLlmInvocation<TOutput>,
  model: LanguageModelV3,
  config: ModelConfig,
) {
  return {
    model,
    schema: invocation.schema,
    schemaName: invocation.schemaName,
    system: invocation.system,
    messages: [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: invocation.userPayload }],
      },
    ],
    maxRetries: MAX_RETRIES,
    experimental_telemetry: makeTelemetry({
      stepName: invocation.stepName,
      callPurpose: callPurposeFor(invocation.modelKind),
      runtimeContext: invocation.ctx,
      provider: config.provider,
      model: config.model,
    }),
  };
}

function callPurposeFor(kind: ModelKind): "extract" | "compose" {
  return kind === "compose" ? "compose" : "extract";
}
