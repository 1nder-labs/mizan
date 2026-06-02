/**
 * Whether a member <option> is disabled for the current viewer. Admins may
 * pick anyone. A reviewer may only ever select their own option (to claim an
 * unassigned case or keep one already theirs); every other member is disabled.
 * The container-level enable gate already blocks the whole select when a
 * reviewer views a case assigned to someone else.
 *
 * Pure + dependency-free so it stays unit-testable without importing the
 * auth-client / query component chain.
 */
export function deriveOptionDisabled(
  role: "reviewer" | "admin",
  currentAssignee: string | null,
  optionUserId: string | null,
  viewerId: string,
): boolean {
  if (role === "admin") return false;
  if (optionUserId === null) return currentAssignee !== viewerId;
  return optionUserId !== viewerId;
}
