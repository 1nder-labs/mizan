/**
 * Reads `activeOrganizationId` from a better-auth session row when present.
 */
export function readActiveOrganizationId(session: { id: string; userId: string }): string | null {
  if (!("activeOrganizationId" in session)) return null;
  const value = session["activeOrganizationId"];
  return typeof value === "string" ? value : null;
}
