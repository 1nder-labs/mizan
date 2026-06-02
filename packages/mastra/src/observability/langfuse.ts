/**
 * Native Mastra Langfuse exporter wiring.
 *
 * Mastra 1.32+ ships `@mastra/langfuse` as a first-class observability
 * exporter — wire it via `Mastra({ observability: { configs: { langfuse: …} } })`.
 * This replaces the earlier `@vercel/otel` + `langfuse-vercel` AI-SDK
 * route, which was the correct shape for raw AI-SDK apps but bypassed
 * Mastra's workflow-aware span propagation.
 *
 * **Fail-closed gate:** activates only when ALL THREE of `LANGFUSE_HOST`
 * (non-empty), `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` are
 * present. Without the `LANGFUSE_HOST` check, keys present + empty host
 * would produce a live exporter whose `baseUrl` falls back to the SDK
 * default `https://cloud.langfuse.com`, shipping PII to the public cloud.
 */

import { LangfuseExporter } from "@mastra/langfuse";
import type { CloudflareBindings } from "@mizan/shared";

/** Returns a configured exporter or null when credentials are missing. */
export function buildLangfuseExporter(env: CloudflareBindings): LangfuseExporter | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  const host = env.LANGFUSE_HOST;
  if (!publicKey || !secretKey || !host) return null;
  return new LangfuseExporter({
    publicKey,
    secretKey,
    baseUrl: host,
    environment: "development",
  });
}

export { LangfuseExporter };
