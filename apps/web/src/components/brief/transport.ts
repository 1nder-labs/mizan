/**
 * Durable brief-stream transport factory for `useChat`.
 *
 * `prepareSendMessagesRequest` returns an empty body — the worker
 * (`apps/worker/src/routes/cases.ts`) reads inputs from URL params +
 * producer-guard context and does not consume the request body. The
 * AI SDK default wraps messages in `{ messages: [...] }` which the
 * worker would discard; empty `{}` matches the contract exactly.
 *
 * `prepareReconnectToStreamRequest` overrides the default resume URL
 * (`${api}/${chatId}/stream`) to hit the dedicated durable-buffer
 * replay endpoint at `GET /api/cases/:id/brief/stream`. The SDK calls
 * this on mount when `resume: true` is set; a 204 response means no
 * active run and the SDK silently no-ops (no error, no state change).
 *
 * `useChat`'s POST does not go through `apiMutate`: `DefaultChatTransport`
 * owns the stream request lifecycle and `hc<AppType>` doesn't model
 * SSE returns.
 */
import { DefaultChatTransport } from "ai";

export function streamApi(caseId: string): string {
  return `/api/cases/${caseId}/brief`;
}

export function resumeApi(caseId: string): string {
  return `/api/cases/${caseId}/brief/stream`;
}

export function buildTransport(caseId: string) {
  return new DefaultChatTransport({
    api: streamApi(caseId),
    headers: { Accept: "text/event-stream" },
    prepareSendMessagesRequest: () => ({ body: {} }),
    prepareReconnectToStreamRequest: () => ({ api: resumeApi(caseId) }),
  });
}
