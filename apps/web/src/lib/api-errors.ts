/**
 * Typed API error classes shared across the client data layer. Kept in a
 * leaf module (depends only on `@mizan/shared` types) so query-options
 * factories, mutations, and identity probes can all throw the same
 * `instanceof`-checkable errors without forming an import cycle through
 * `query-keys.ts` / `cases-api.ts`.
 *
 * Auth-failure split: 401 → `UnauthorizedError` (session expired, bounce to
 * `/login` via `query-client.ts`); 403 → `ForbiddenError` (authenticated but
 * lacks the role) surfaces as an in-place error on the protected route.
 */
import type { ActionErrorCode } from "@mizan/shared";

/**
 * Carries the server's `ActionErrorCode` discriminator so callers can
 * `instanceof` + switch on `.code` instead of string-matching `.message`.
 */
export class ReviewerActionError extends Error {
  readonly code: ActionErrorCode;
  readonly status: number;
  constructor(code: ActionErrorCode, status: number) {
    super(code);
    this.name = "ReviewerActionError";
    this.code = code;
    this.status = status;
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Session expired") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403 as const;
  constructor(message = "You don't have permission to view this resource") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertAuthorized(status: number): void {
  if (status === 401) throw new UnauthorizedError();
  if (status === 403) throw new ForbiddenError();
}
