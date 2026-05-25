import { sql, workflow_events, type Db } from "@mizan/db";

export type WorkflowEventType =
  | "workflow.start"
  | "step.suspend"
  | "step.resume"
  | "workflow.finish";

export interface EmitWorkflowEventInput {
  readonly caseId: string;
  readonly runId: string;
  readonly eventType: WorkflowEventType;
  readonly stepId?: string;
  readonly payloadMeta?: Record<string, unknown>;
}

/**
 * Appends one row to `workflow_events` with a monotonic per-run `seq`
 * computed atomically inside a single INSERT statement.
 */
export async function emitWorkflowEvent(
  db: Db,
  input: EmitWorkflowEventInput,
): Promise<{ seq: number }> {
  const inserted = await db
    .insert(workflow_events)
    .values({
      case_id: input.caseId,
      run_id: input.runId,
      event_type: input.eventType,
      step_id: input.stepId ?? null,
      payload_json: input.payloadMeta ?? null,
      seq: sql`(SELECT COALESCE(MAX(seq), 0) + 1 FROM workflow_events WHERE run_id = ${input.runId})`,
    })
    .returning({ seq: workflow_events.seq })
    .get();
  if (!inserted) {
    throw new Error(
      `emitWorkflowEvent: insert returned no row (case=${input.caseId} run=${input.runId} type=${input.eventType})`,
    );
  }
  return { seq: inserted.seq };
}
