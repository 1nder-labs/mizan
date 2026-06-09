/**
 * Mode A SSE transport factory.
 *
 * `prepareSendMessagesRequest` returns an empty body — the worker
 * (`apps/worker/src/routes/cases.ts`) reads inputs from URL params +
 * producer-guard context and does not consume the request body. The
 * AI SDK default wraps messages in `{ messages: [...] }` which the
 * worker would discard; empty `{}` matches the contract exactly.
 *
 * `useChat`'s POST does not go through `apiMutate`: `DefaultChatTransport`
 * owns the stream request lifecycle and `hc<AppType>` doesn't model
 * SSE returns. Single-shot per runId is enforced by the worker's
 * producer-guard, so HTTP-level idempotency is redundant for this
 * endpoint.
 */
import { DefaultChatTransport } from "ai";

export function streamApi(caseId: string): string {
  return `/api/cases/${caseId}/brief`;
}

export function buildTransport(caseId: string) {
  return new DefaultChatTransport({
    api: streamApi(caseId),
    headers: { Accept: "text/event-stream" },
    prepareSendMessagesRequest: () => ({ body: {} }),
  });
}
