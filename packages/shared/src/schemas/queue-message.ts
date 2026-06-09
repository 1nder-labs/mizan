import { z } from "zod";

/**
 * Wire shape for `BRIEF_QUEUE` messages. Validated at the producer
 * before `send()` and again at the consumer on receive so both sides
 * share one schema without trusting the queue transport.
 */
export const BriefQueueMessageSchema = z
  .object({
    caseId: z.string().uuid(),
    runId: z.string().uuid(),
    enqueuedAt: z.number().int().positive(),
    /**
     * better-auth uses nanoid for user IDs by default; the field is
     * informational telemetry only and never validated downstream as a UUID.
     */
    requestedBy: z.string().min(1),
  })
  .strict();

export type BriefQueueMessage = z.infer<typeof BriefQueueMessageSchema>;
