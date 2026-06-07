import { and, eq } from "drizzle-orm";
import { cases as casesTable, type Db } from "@mizan/db";
import type { ViewerContext } from "@mizan/shared";

/** Full `cases` row as selected by the portal ownership guard. */
type OwnedCampaign = typeof casesTable.$inferSelect;

/**
 * Discriminated result of the portal ownership guard. The `false` arm carries
 * no detail so a caller can only ever respond 404 — a campaign owned by a
 * different client, or in another org, is indistinguishable from one that does
 * not exist, which prevents id enumeration across the shared review org.
 */
type OwnedCampaignResult =
  | { readonly ok: true; readonly campaign: OwnedCampaign }
  | { readonly ok: false };

/**
 * Loads a campaign only when the viewer created it AND it belongs to the
 * viewer's organization. This is the client portal's isolation boundary: every
 * per-campaign route resolves its id through this guard before acting on it.
 * Never trust a client-supplied campaign id without it.
 */
export async function loadOwnedCampaign(
  db: Db,
  viewer: ViewerContext,
  caseId: string,
): Promise<OwnedCampaignResult> {
  const campaign = await db
    .select()
    .from(casesTable)
    .where(
      and(
        eq(casesTable.id, caseId),
        eq(casesTable.created_by, viewer.userId),
        eq(casesTable.organization_id, viewer.organizationId),
      ),
    )
    .get();
  if (!campaign) return { ok: false };
  return { ok: true, campaign };
}
