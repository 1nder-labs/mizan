import { z } from "zod";

const NOTE_BODY_MAX = 5000;

/**
 * Note visibility — the security boundary. Derived server-side from the caller's
 * role and the route the note was authored through, never from the request body.
 */
export const NoteVisibilityEnum = z.enum(["client_facing", "internal"]);
export type NoteVisibility = z.infer<typeof NoteVisibilityEnum>;

/** Role of the note author — mirrors the writer's org member role. */
export const NoteAuthorRoleEnum = z.enum(["admin", "reviewer", "client"]);
export type NoteAuthorRole = z.infer<typeof NoteAuthorRoleEnum>;

/** Wire shape of one note returned by the read routes. */
export const CaseNoteSchema = z
  .object({
    id: z.string(),
    authorRole: NoteAuthorRoleEnum,
    visibility: NoteVisibilityEnum,
    body: z.string(),
    createdAt: z.number(),
  })
  .strict();
export type CaseNote = z.infer<typeof CaseNoteSchema>;

export const CaseNotesResponseSchema = z.object({ notes: z.array(CaseNoteSchema) }).strict();
export type CaseNotesResponse = z.infer<typeof CaseNotesResponseSchema>;

/**
 * POST body for authoring a note — only the free text. Visibility and author
 * role are assigned server-side, so a client request can never mint an internal
 * note nor forge a reviewer authorship.
 */
export const NoteCreateSchema = z.object({ body: z.string().min(1).max(NOTE_BODY_MAX) }).strict();
export type NoteCreate = z.infer<typeof NoteCreateSchema>;
