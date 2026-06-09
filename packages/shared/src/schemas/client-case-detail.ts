import { z } from "zod";
import { CaseNoteSchema } from "./case-note.ts";
import { ClientStatusEnum } from "./client-status.ts";
import { DocumentKeyEnum } from "./document-url.ts";

/** Per-doc evidence state shown to the client (uploaded yes/no — never the key). */
export const ClientEvidenceItemSchema = z
  .object({ docKind: DocumentKeyEnum, uploaded: z.boolean() })
  .strict();

/** The reviewer's drafted organizer ask, surfaced only when needs_evidence. */
export const OrganizerAskSchema = z
  .object({ message: z.string(), missingItems: z.array(z.string()) })
  .strict();

/** One row in the client's campaign list. */
export const ClientCampaignSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    geography: z.string(),
    status: ClientStatusEnum,
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();
export type ClientCampaignSummary = z.infer<typeof ClientCampaignSummarySchema>;

export const ClientCampaignsResponseSchema = z
  .object({ campaigns: z.array(ClientCampaignSummarySchema) })
  .strict();
export type ClientCampaignsResponse = z.infer<typeof ClientCampaignsResponseSchema>;

/**
 * Strict client-facing campaign detail. `.strict()` is the structural PII guard:
 * a future internal brief field (signals, confidence, policy_citations, internal
 * notes, raw recommendation) cannot leak because it is not declared here.
 */
export const ClientCaseDetailSchema = z
  .object({
    id: z.string(),
    status: ClientStatusEnum,
    category: z.string(),
    geography: z.string(),
    claimedZakatCategory: z.string().nullable(),
    story: z.string(),
    organizerName: z.string(),
    vouchingNarrative: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
    evidence: z.array(ClientEvidenceItemSchema),
    organizerAsk: OrganizerAskSchema.nullable(),
    notes: z.array(CaseNoteSchema),
  })
  .strict();
export type ClientCaseDetail = z.infer<typeof ClientCaseDetailSchema>;
