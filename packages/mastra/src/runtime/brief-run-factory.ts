import type { CloudflareBindings } from "@mizan/shared";
import { createMastra, type MizanMastraBundle } from "../mastra-factory.ts";
import { makeRuntimeContext, type MizanRuntimeContext } from "../observability/runtime-context.ts";
import { deriveSessionId } from "../observability/trace-id.ts";
import { MIZAN_ENV_KEY } from "./context-accessors.ts";

/**
 * Inputs needed to build the `MizanRuntimeContext` for a brief workflow run.
 * `sessionId` defaults to `null`; `langfuseEnabled` is derived from env keys.
 */
export interface BriefRunContextInput {
  readonly caseId: string;
  readonly runId: string;
  readonly reviewerId: string;
  readonly organizationId: string;
  readonly category: string;
  readonly geography: string;
  readonly sessionId?: string | null;
}

/**
 * Constructs the `MizanRuntimeContext` consumed by every workflow step.
 * `langfuseEnabled` is derived from the env, never trusted from callers.
 */
export function buildBriefRunContext(
  env: CloudflareBindings,
  input: BriefRunContextInput,
): MizanRuntimeContext {
  return {
    caseId: input.caseId,
    runId: input.runId,
    reviewerId: input.reviewerId,
    sessionId: input.sessionId ?? deriveSessionId(input.runId),
    organizationId: input.organizationId,
    category: input.category,
    geography: input.geography,
    langfuseEnabled: Boolean(
      env.LANGFUSE_HOST && env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY,
    ),
  };
}

/** Trace-level grouping passed to `run.start()`/`run.stream()`. */
export interface BriefTracingOptions {
  readonly metadata: Record<string, string>;
  readonly tags: string[];
}

/**
 * Builds the trace-level grouping for a brief run: flat metadata (so
 * Langfuse can filter/group traces by case, org, reviewer, and session)
 * plus tags. Set on the workflow root trace via `tracingOptions`, which
 * the `@mastra/langfuse` exporter maps onto `langfuse.trace.metadata.*`
 * and `langfuse.trace.tags`.
 */
export function buildBriefTracingOptions(ctx: MizanRuntimeContext): BriefTracingOptions {
  return {
    metadata: {
      caseId: ctx.caseId,
      runId: ctx.runId,
      organizationId: ctx.organizationId,
      reviewerId: ctx.reviewerId ?? "",
      sessionId: ctx.sessionId ?? "",
      category: ctx.category,
      geography: ctx.geography,
    },
    tags: ["mizan", ctx.category, ctx.geography],
  };
}

/** Shape returned by `createBriefRun` — the run handle plus durable bookkeeping. */
export interface BriefRunBundle {
  readonly langfuse: MizanMastraBundle["langfuse"];
  readonly run: Awaited<
    ReturnType<ReturnType<MizanMastraBundle["mastra"]["getWorkflow"]>["createRun"]>
  >;
  readonly requestContext: ReturnType<typeof makeRuntimeContext>;
  readonly tracingOptions: BriefTracingOptions;
}

/**
 * Single source of truth for booting a brief workflow run. Constructs the
 * per-request Mastra instance, resolves the `brief` workflow, pins the
 * caller-supplied `runId` for durable persistence, and primes the
 * `RequestContext` with the env slot every step reads via `getEnv`.
 * `MIZAN_CTX_KEY` is already set by `makeRuntimeContext`, so we don't
 * re-set it here. Callers decide between `run.stream()` (Mode A) and
 * `run.start()` (Mode B); both paths share this exact bootstrap.
 */
export async function createBriefRun(
  env: CloudflareBindings,
  input: BriefRunContextInput,
): Promise<BriefRunBundle> {
  const ctx = buildBriefRunContext(env, input);
  const { mastra, langfuse } = createMastra(env);
  const workflow = mastra.getWorkflow("brief");
  const run = await workflow.createRun({ runId: input.runId });
  const requestContext = makeRuntimeContext(ctx);
  requestContext.set(MIZAN_ENV_KEY, env);
  return { langfuse, run, requestContext, tracingOptions: buildBriefTracingOptions(ctx) };
}
