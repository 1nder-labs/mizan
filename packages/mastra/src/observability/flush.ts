/**
 * Cloudflare Workers helper — drain the per-request Langfuse exporter via
 * `ctx.waitUntil(...)` so the SSE response returns immediately while the
 * span batch ships to Langfuse on background.
 *
 * Native `@mastra/langfuse` exporter exposes `.flush()` for serverless
 * environments where the isolate would otherwise be reclaimed before the
 * default flush-interval drain fires.
 */

import type { ExecutionContext } from "@cloudflare/workers-types";
import type { LangfuseExporter } from "@mastra/langfuse";

export function flushLangfuse(exporter: LangfuseExporter | null, ctx: ExecutionContext): void {
  if (!exporter) return;
  ctx.waitUntil(exporter.flush());
}
