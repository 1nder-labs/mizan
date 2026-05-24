import { Mastra } from "@mastra/core";
import { D1Store } from "@mastra/cloudflare-d1";
import { Observability } from "@mastra/observability";
import type { CloudflareBindings } from "@mizan/shared";
import { buildLangfuseExporter, LangfuseExporter } from "./observability/langfuse.ts";
import { briefWorkflow } from "./workflows/brief.workflow.ts";

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
