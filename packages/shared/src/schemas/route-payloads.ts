import { z } from "zod";

/**
 * HTTP route validation schemas for Hono endpoints.
 *
 * Lives in `@mizan/shared` (not `@mizan/db`) because route payloads are
 * the API surface contract — clients consume them, the worker validates
 * them. Coupling them to the Drizzle tables would tie the public API
 * shape to internal storage, which the two are not obligated to share.
 */

const uuid = z.string().uuid();

/** Request body for the admin echo endpoint (`/api/admin/echo`). */
export const EchoSchema = z.object({
  message: z.string().min(1).max(500),
  action_id: uuid,
});

export type EchoPayload = z.infer<typeof EchoSchema>;
