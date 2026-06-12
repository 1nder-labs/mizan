import {
  assertCommunityVouchingCorroborated,
  assertPartnerOrgCorroborated,
  assertVouchingChain,
  type VouchingChain,
} from "@mizan/shared";

/**
 * Applies the vouching corroboration guards, but DEGRADES to an uncorroborated
 * `none` chain (carrying the rejection reason as the finding) instead of
 * throwing.
 *
 * The guards correctly reject an accountability structure the case's
 * `vouching_narrative` does not support — e.g. the model proposes `org-direct`
 * to a partner named only in the free-form story, not the vouching narrative.
 * But that rejection is a TRUST FINDING for the reviewer, not an infra fault:
 * letting it throw bricks the entire brief (the workflow fails and the case
 * sticks in RUNNING). Collapsing to `none` keeps the brief composing while the
 * narrative tells the reviewer exactly why the claimed chain was not honored.
 *
 * Kept in its own module (no `@mastra/core`) so the degrade is unit-testable
 * without booting the step's workflow graph.
 */
export function corroborateOrDegrade(
  chain: VouchingChain,
  source: { readonly story: string; readonly vouching_narrative: string | null },
): VouchingChain {
  try {
    return assertCommunityVouchingCorroborated(
      assertPartnerOrgCorroborated(assertVouchingChain(chain), source),
      source,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      structure: "none",
      weakest_link_narrative: `A vouching/accountability chain was claimed but could not be corroborated against the campaign's stated supporters, so it is treated as unvouched and flagged for the reviewer: ${reason}`,
    };
  }
}
