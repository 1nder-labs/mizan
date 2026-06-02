import { z } from "zod";

/** Response shape for `GET /api/me`. */
export const MeResponseSchema = z
  .object({
    user: z
      .object({
        id: z.string(),
        email: z.string(),
        role: z.enum(["reviewer", "admin"]),
        activeOrganizationId: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export type MeResponse = z.infer<typeof MeResponseSchema>;
