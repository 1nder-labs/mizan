import { z } from "zod";
import { DocumentKindEnum } from "./document.ts";
import { CaseStatusEnum } from "./queue-search.ts";
import { CampaignCategoryEnum, ZakatCategoryEnum } from "./campaign-taxonomy.ts";
import { COUNTRY_CODE_SET } from "../data/countries.ts";

/**
 * Client-portal campaign intake contracts (U4). A campaign is a `cases` row:
 * `category`/`geography`/`claimed_zakat_category` are columns; `story`,
 * `organizer_name`, and `vouching_narrative` live in the strict
 * `CaseOverlaySchema` overlay (`cases.brief_partial_json`). Evidence files are
 * NOT part of intake — they are uploaded server-side into the `documents` table
 * after the campaign row exists.
 *
 * `.strict()` rejects extra keys, so a client can never mass-assign
 * server-controlled columns (status, created_by, organization_id, assigned_to).
 */
const STORY_MAX = 5000;
const NAME_MAX = 200;
const TITLE_MAX = 120;

export const CampaignCreateSchema = z
  .object({
    title: z.string().min(3).max(TITLE_MAX),
    story: z.string().min(1).max(STORY_MAX),
    organizer_name: z.string().min(1).max(NAME_MAX),
    category: CampaignCategoryEnum,
    geography: z
      .string()
      .refine((code) => COUNTRY_CODE_SET.has(code), { message: "Select a country from the list" }),
    claimed_zakat_category: ZakatCategoryEnum.optional(),
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
 * Returned by an evidence upload. `docKind` is one of the document kinds (the 3
 * extraction slots or `supplementary`); `key` is the server-derived versioned
 * R2 object key (`<caseId>/<docKind>/<uuid>`). The client never supplies the key.
 */
export const EvidenceUploadResponseSchema = z
  .object({ docKind: DocumentKindEnum, key: z.string() })
  .strict();
export type EvidenceUploadResponse = z.infer<typeof EvidenceUploadResponseSchema>;
