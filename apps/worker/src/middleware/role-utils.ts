/**
 * Shared role type consumed by `require-role.ts` and `apps/worker/src/routes/me.ts`.
 */

/** The two roles supported by Mizan. "reviewer" is the default. */
export type Role = "reviewer" | "admin";
