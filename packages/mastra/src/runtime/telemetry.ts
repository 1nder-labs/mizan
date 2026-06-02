import type { MizanRuntimeContext } from "../observability/runtime-context.ts";
import type { ModelConfig } from "../models/factory.ts";

export interface TelemetryInput {
  readonly stepName: string;
  readonly callPurpose: string;
  readonly runtimeContext: MizanRuntimeContext;
  readonly provider: ModelConfig["provider"];
  readonly model: string;
}

type TelemetryMetadata = Record<string, string | number | boolean>;

/** Builds the AI SDK experimental_telemetry envelope with Langfuse-recognized keys. */
export function makeTelemetry(input: TelemetryInput): {
  isEnabled: boolean;
  functionId: string;
  metadata: TelemetryMetadata;
} {
  const functionId = `${input.stepName}.${input.callPurpose}`;
  const tags = ["mizan", input.runtimeContext.category, input.runtimeContext.geography].join(",");
  return {
    isEnabled: input.runtimeContext.langfuseEnabled,
    functionId,
    metadata: {
      sessionId: input.runtimeContext.sessionId ?? "",
      userId: input.runtimeContext.reviewerId ?? "",
      tags,
      caseId: input.runtimeContext.caseId,
      runId: input.runtimeContext.runId,
      stepId: input.stepName,
      provider: input.provider,
      model: input.model,
      organizationId: input.runtimeContext.organizationId,
    },
  };
}
