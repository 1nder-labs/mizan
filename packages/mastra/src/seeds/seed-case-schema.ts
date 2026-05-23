/**
 * Re-export of the canonical seed-case schema from `@mizan/shared`.
 *
 * The shape lives in `@mizan/shared` so deploy scripts can validate
 * seeds without dragging in `@mizan/mastra/testing`. This file remains
 * the conventional import location for the `@mizan/mastra` testing
 * barrel, which is the import path used by integration tests and eval
 * fixtures.
 */
export { SeedCaseSchema, type SeedCase } from "@mizan/shared";
