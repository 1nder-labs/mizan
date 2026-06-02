import { z } from "zod";
import { DocumentKeyEnum } from "./document-url.ts";
import { CaseStatusEnum } from "./queue-search.ts";

/**
 * Client-portal campaign intake contracts (U4). A campaign is a `cases` row:
 * `category`/`geography`/`claimed_zakat_category` are columns; `story`,
 * `organizer_name`, and `vouching_narrative` live in the strict
 * `CaseOverlaySchema` overlay (`cases.brief_partial_json`). The 3 evidence
 * `r2_keys` are NOT part of intake — they are filled server-side by the
 * evidence-upload unit, so the create route seeds them empty.
 *
 * `.strict()` rejects extra keys, so a client can never mass-assign
 * server-controlled columns (status, created_by, organization_id, assigned_to).
 */
const STORY_MAX = 5000;
const NAME_MAX = 200;
const FIELD_MAX = 120;

export const CampaignCreateSchema = z
  .object({
    story: z.string().min(1).max(STORY_MAX),
    organizer_name: z.string().min(1).max(NAME_MAX),
    category: z.string().min(1).max(FIELD_MAX),
    geography: z.string().min(1).max(FIELD_MAX),
    claimed_zakat_category: z.string().min(1).max(FIELD_MAX).optional(),
    vouching_narrative: z.string().min(1).max(STORY_MAX).optional(),
  })
  .strict();
export type CampaignCreate = z.infer<typeof CampaignCreateSchema>;

/** Returned by create + edit: the campaign id and its (server-owned) status. */
export const CampaignMutationResponseSchema = z
  .object({ id: z.string(), status: CaseStatusEnum })
  .strict();
export type CampaignMutationResponse = z.infer<typeof CampaignMutationResponseSchema>;

/**
 * Returned by an evidence upload. `docKind` is one of the three core docs;
 * `key` is the server-derived R2 object key (`<caseId>/<docKind>`) now recorded
 * in the overlay `r2_keys`. The client never supplies the key.
 */
export const EvidenceUploadResponseSchema = z
  .object({ docKind: DocumentKeyEnum, key: z.string() })
  .strict();
export type EvidenceUploadResponse = z.infer<typeof EvidenceUploadResponseSchema>;
