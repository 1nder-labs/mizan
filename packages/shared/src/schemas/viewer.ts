import { z } from "zod";
import { RoleEnum } from "./role.ts";

/** Canonical viewer identity passed to handler helpers and Mastra tools. */
export const ViewerContextSchema = z
  .object({
    userId: z.string(),
    role: RoleEnum,
    organizationId: z.string(),
  })
  .strict();

export type ViewerContext = z.infer<typeof ViewerContextSchema>;
