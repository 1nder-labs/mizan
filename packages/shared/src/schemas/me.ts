import { z } from "zod";
import { RoleEnum } from "./role.ts";

/** Response shape for `GET /api/me`. */
export const MeResponseSchema = z
  .object({
    user: z
      .object({
        id: z.string(),
        email: z.string(),
        role: RoleEnum,
        activeOrganizationId: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export type MeResponse = z.infer<typeof MeResponseSchema>;
