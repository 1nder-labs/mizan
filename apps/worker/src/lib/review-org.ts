import type { CloudflareBindings } from "../env.ts";

/**
 * Resolves the single designated review organization id that client
 * self-signups join as `client` members (multi-review-org routing is
 * deferred — this PR provisions every client into one org).
 *
 * Throws when `REVIEW_ORG_ID` is unset or blank so a misconfigured worker
 * fails loud at the first client signup rather than silently provisioning
 * the user into the wrong org (or none). Internal and invited signups never
 * call this — only the `client` branch of `provisionOrgOnSignup` does, so a
 * blank value never blocks normal signup.
 */
export function resolveReviewOrgId(env: Pick<CloudflareBindings, "REVIEW_ORG_ID">): string {
  const id = env.REVIEW_ORG_ID;
  if (!id || id.trim().length === 0) {
    throw new Error(
      "REVIEW_ORG_ID is unset — seed the review org and set REVIEW_ORG_ID before client signups (see scripts/seed-users.ts).",
    );
  }
  return id;
}
