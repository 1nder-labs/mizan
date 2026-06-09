/**
 * Pre-first-save autosave for the campaign intake form, built on the reusable
 * `storage` util so the details a client types before the draft is created
 * server-side survive a refresh or accidental navigation. Once step 1 creates
 * the server draft, THAT is the source of truth (it lives in the client's
 * campaign list and resumes from the detail page) — this only covers the brief
 * window before the first save. Values are validated against the partial
 * campaign schema on read, so corrupt/legacy data is discarded, not trusted.
 */
import type { z } from "zod";
import { CampaignCreateSchema } from "@mizan/shared";
import { readStored, removeStored, writeStored } from "./storage.ts";

const DRAFT_PREFIX = "mizan:campaign-draft:";
const DraftSchema = CampaignCreateSchema.partial();

/** In-progress intake values — every field optional (the looser z-partial type). */
export type CampaignDraft = z.infer<typeof DraftSchema>;

export function readCampaignDraft(key: string): CampaignDraft | undefined {
  return readStored(DRAFT_PREFIX + key, DraftSchema);
}

export function writeCampaignDraft(key: string, values: CampaignDraft): void {
  writeStored(DRAFT_PREFIX + key, values);
}

export function clearCampaignDraft(key: string): void {
  removeStored(DRAFT_PREFIX + key);
}
