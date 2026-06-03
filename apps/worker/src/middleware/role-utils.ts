/**
 * Re-exports the canonical `Role` (single source of truth in `@mizan/shared`,
 * derived from `ROLE_VALUES`) for `require-role.ts` and
 * `apps/worker/src/routes/me.ts`. Kept as a thin local alias so those modules
 * import from one worker-local path.
 */
export type { Role } from "@mizan/shared";
