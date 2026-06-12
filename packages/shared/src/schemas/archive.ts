import { z } from "zod";

/** Response body for `POST /api/cases/:id/archive` + `/unarchive` — the new archived state. */
export const ArchiveResponseSchema = z.object({ archived: z.boolean() }).strict();
export type ArchiveResponse = z.infer<typeof ArchiveResponseSchema>;
