import { ApiError } from "./api-errors.ts";
import { COPY } from "./copy-constants.ts";

/**
 * User-facing copy for a reviewer-action failure. Defers to the unified
 * `ApiError.message` (mapped from the server's `{ error: code }` via
 * `errorMessage`) so the inline action panel and the kanban action modal show
 * the same message as the rest of the app for a given code.
 */
export function describeActionError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : COPY.apiError.fallback;
}
