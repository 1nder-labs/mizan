import { z } from "zod";

/** Canonical viewer identity passed to handler helpers and Mastra tools. */
export const ViewerContextSchema = z
  .object({
    userId: z.string(),
    role: z.enum(["reviewer", "admin"]),
    organizationId: z.string(),
  })
  .strict();

export type ViewerContext = z.infer<typeof ViewerContextSchema>;
