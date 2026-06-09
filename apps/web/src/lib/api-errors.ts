/**
 * One consistent client-side error schema for every API surface.
 *
 * `ApiError` carries `status` (HTTP), `code` (the server's `{ error: <code> }`
 * discriminator — DESTRUCTURED from the response body, never guessed from the
 * status), and `message` (the user-facing string mapped from `COPY.apiError`).
 * `apiError(res)` is the single factory every data-layer call uses on a failed
 * response, so toasts and the route error page read one shape and show the
 * right message. 401 → `UnauthorizedError` (bounce to /login via
 * `query-client.ts`); 403 → `ForbiddenError` (in-place on the protected route).
 */
import { z } from "zod";
import type { ActionErrorCode } from "@mizan/shared";
import { COPY } from "./copy-constants.ts";

const ErrorBodySchema = z.object({ error: z.string() });

/** Friendly, user-facing message for a server error code. */
export function errorMessage(code: string): string {
  const map: Record<string, string> = COPY.apiError;
  return map[code] ?? COPY.apiError.fallback;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string = errorMessage(code)) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export class UnauthorizedError extends ApiError {
  constructor() {
    super(401, "unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(code = "forbidden") {
    super(403, code);
    this.name = "ForbiddenError";
  }
}

/**
 * Carries the server's `ActionErrorCode` so the action panel can switch on
 * `.code`; still an `ApiError`, so `.message` is the mapped friendly string.
 */
export class ReviewerActionError extends ApiError {
  constructor(code: ActionErrorCode, status: number) {
    super(status, code);
    this.name = "ReviewerActionError";
  }
}

/** Minimal shape shared by DOM `Response` and Hono's typed `ClientResponse`. */
type FailedResponse = { readonly status: number; readonly json: () => Promise<unknown> };

/**
 * Builds the right `ApiError` from a failed response by destructuring the
 * shared `{ error: code }` body once. Accepts both a raw `fetch` `Response` and
 * a Hono `ClientResponse`. 401/403 return the typed subclasses the auth flow +
 * protected routes rely on; everything else carries the body code (falling back
 * to `internal_error` for an unreadable 5xx body).
 */
export async function apiError(res: FailedResponse): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const parsed = ErrorBodySchema.safeParse(body);
  const code = parsed.success
    ? parsed.data.error
    : res.status >= 500
      ? "internal_error"
      : "unknown";
  if (res.status === 401) return new UnauthorizedError();
  if (res.status === 403) return new ForbiddenError(code);
  return new ApiError(res.status, code);
}

export function assertAuthorized(status: number): void {
  if (status === 401) throw new UnauthorizedError();
  if (status === 403) throw new ForbiddenError();
}
