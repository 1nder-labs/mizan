/**
 * Shared role-extraction utilities consumed by `require-role.ts` and
 * `apps/worker/src/routes/me.ts`.
 *
 * `Role` is defined here (not in `require-role.ts`) so that `extractRole`
 * can reference it without creating a circular import.
 * `require-role.ts` re-exports `Role` from this module.
 */

/** The two roles supported by Mizan. "reviewer" is the default. */
export type Role = "reviewer" | "admin";

/**
 * Type guard for narrowing an open value to the `Role` union.
 *
 * Used to convert `session.user.role` (carried at runtime but not included
 * in the base better-auth User type when Options inference is lost) to the
 * canonical `Role` type without requiring an unsafe cast.
 */
function isRole(v: unknown): v is Role {
  return v === "reviewer" || v === "admin";
}

/**
 * Type guard for narrowing to `Record<string, unknown>`.
 * Enables safe property access on structurally-open objects.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Extracts the `Role` from a structurally-open user object.
 *
 * better-auth's `additionalFields.role` is present at runtime on every user
 * row, but when `Options` inference is lost (e.g. because of an upstream
 * `@ts-expect-error`), the static type reverts to the base User shape which
 * does not include `role`. Accepting `unknown` here lets us apply type guards
 * without any cast, and we default to `"reviewer"` for any unrecognised shape.
 */
export function extractRole(user: unknown): Role {
  if (isRecord(user) && isRole(user["role"])) return user["role"];
  return "reviewer";
}
