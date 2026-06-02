import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CopilotHandlerDeps } from "./deps.ts";

/** Read-only signals listing tool for the reviewer copilot. */
export function createListSignalsTool(deps: CopilotHandlerDeps) {
  return createTool({
    id: "list_signals",
    description:
      "List trust signals extracted for one case by its case id. Returns rows with signal_type, payload_json (the signal's score and details live inside payload_json), recorded_at, and run_id. Use to understand a case's evidence flags.",
    inputSchema: z.object({ caseId: z.string().uuid() }),
    outputSchema: z.object({ signals: z.array(z.record(z.string(), z.unknown())) }),
    execute: async (inputData, context) => {
      const { viewer, db } = deps.parseRuntime(context?.requestContext);
      const signals = await deps.listSignalsForCase(inputData.caseId, viewer, db);
      return {
        signals: signals.map((signal) => ({
          signal_type: signal.signal_type,
          payload_json: signal.payload_json,
          recorded_at: signal.recorded_at,
          run_id: signal.run_id,
        })),
      };
    },
  });
}
