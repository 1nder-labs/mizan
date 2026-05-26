/**
 * Per-file MSW server factory. Each integration test instantiates a
 * server with its own handlers so request mocks stay scoped to the
 * file under test. Set on `globalThis.fetch` via MSW's `setupServer`
 * which monkey-patches the global before each test boots.
 */
import { setupServer } from "msw/node";
import type { RequestHandler } from "msw";

export function startServer(handlers: readonly RequestHandler[]) {
  return setupServer(...handlers);
}
