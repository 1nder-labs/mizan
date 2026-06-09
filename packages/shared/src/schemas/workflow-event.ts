import { z } from "zod";

export const WorkflowEventTypeEnum = z.enum([
  "workflow.start",
  "step.suspend",
  "step.resume",
  "workflow.finish",
]);

export type WorkflowEventType = z.infer<typeof WorkflowEventTypeEnum>;

/**
 * Narrow metadata carried on the SSE wire for workflow_events rows.
 * Excludes the full brief payload — brief content is delivered via
 * the POST AI stream and GET case detail, not the resumability tape.
 */
export const WorkflowEventPayloadMetaSchema = z
  .object({
    awaiting: z.literal("reviewer_action").optional(),
    caseId: z.string().uuid(),
    runId: z.string().uuid(),
    briefId: z.string().uuid().optional(),
  })
  .strict();

export type WorkflowEventPayloadMeta = z.infer<typeof WorkflowEventPayloadMetaSchema>;

/**
 * SSE projection of a `workflow_events` row. Strips any nested brief
 * from persisted payload_json before validation.
 */
export const WorkflowEventSchema = z.object({
  seq: z.number().int().positive(),
  event_type: WorkflowEventTypeEnum,
  step_id: z.string().nullable().optional(),
  emitted_at: z.number().int(),
  payload_meta: WorkflowEventPayloadMetaSchema.nullable().optional(),
});

export type WorkflowEvent = z.infer<typeof WorkflowEventSchema>;

/**
 * Maps a persisted workflow_events row to the SSE wire shape,
 * dropping brief-bearing fields from payload_json.
 */
export function toWorkflowEventWire(row: {
  seq: number;
  event_type: string;
  step_id: string | null;
  emitted_at: Date | number;
  payload_json: Record<string, unknown> | null;
}): WorkflowEvent {
  const emittedAt = row.emitted_at instanceof Date ? row.emitted_at.getTime() : row.emitted_at;
  const rawMeta = row.payload_json;
  let payloadMeta: WorkflowEventPayloadMeta | null = null;
  if (rawMeta && typeof rawMeta === "object") {
    const { brief: _brief, ...rest } = rawMeta;
    const parsed = WorkflowEventPayloadMetaSchema.safeParse(rest);
    payloadMeta = parsed.success ? parsed.data : null;
  }
  return WorkflowEventSchema.parse({
    seq: row.seq,
    event_type: row.event_type,
    step_id: row.step_id,
    emitted_at: emittedAt,
    payload_meta: payloadMeta,
  });
}
