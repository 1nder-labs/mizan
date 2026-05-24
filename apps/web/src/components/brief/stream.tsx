/**
 * Live brief stream — wires `useChat` against the worker's Mode A
 * SSE endpoint at `POST /api/cases/:id/brief`. The worker reads its
 * inputs from URL params + producer-guard context (see
 * `apps/worker/src/routes/cases.ts:32-66`), so the canonical
 * stream-open trigger is `sendMessage({ text: '' })` on mount —
 * the empty payload is intentional, do NOT "fix" it.
 *
 * On `onFinish` we invalidate the case detail query so the parent
 * route re-fetches the persisted brief + flipped status. The
 * derived view (text, tools, steps) is folded each render via
 * `foldParts(messages.parts)` so component state remains a pure
 * function of the streamed parts.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { queryKeys } from "@/lib/query-keys.ts";
import { BriefCopy } from "./copy.tsx";
import { ExtractionCard } from "./extraction-card.tsx";
import { StepProgress } from "./step-progress.tsx";
import { foldParts } from "./stream-parts.ts";

interface BriefStreamProps {
  readonly caseId: string;
}

function StreamError({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <Alert variant="destructive">
      <AlertTitle>Brief stream failed</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function streamApi(caseId: string): string {
  return `/api/cases/${caseId}/brief`;
}

/**
 * Mode A SSE transport.
 *
 * `prepareSendMessagesRequest` returns an empty body — the worker
 * (`apps/worker/src/routes/cases.ts:32-66`) reads inputs from URL
 * params + producer-guard context and does NOT consume the request
 * body. Sending an empty `{}` matches that contract exactly; the AI
 * SDK 6 default would otherwise wrap the (empty) message in
 * `{ messages: [...] }` which the worker would silently discard but
 * is wasted bytes. `Accept: text/event-stream` matches the worker's
 * `wantsEventStream(c)` content negotiation in
 * `apps/worker/src/routes/cases.ts:33`.
 */
function buildTransport(caseId: string) {
  return new DefaultChatTransport({
    api: streamApi(caseId),
    headers: { Accept: "text/event-stream" },
    prepareSendMessagesRequest: () => ({ body: {} }),
  });
}

/**
 * Pins `sendMessage` to one POST per `caseId` mount. React 19
 * StrictMode mounts effects twice in dev; firing twice would race
 * the worker's producer guard.
 */
function useStreamOpener(caseId: string, sendMessage: (input: { text: string }) => void): void {
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (openedFor.current === caseId) return;
    openedFor.current = caseId;
    sendMessage({ text: "" });
  }, [caseId, sendMessage]);
}

export function BriefStream({ caseId }: BriefStreamProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const transport = useMemo(() => buildTransport(caseId), [caseId]);
  const { messages, sendMessage, error, status } = useChat({
    id: `case-${caseId}`,
    transport,
    onFinish: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
    },
  });

  useStreamOpener(caseId, (input) => {
    void sendMessage(input);
  });

  const assistantParts = useMemo(
    () => messages.flatMap((message) => (message.role === "assistant" ? message.parts : [])),
    [messages],
  );
  const view = useMemo(() => foldParts(assistantParts), [assistantParts]);
  const fatal = error ?? (status === "error" ? new Error("Stream closed unexpectedly") : null);

  return (
    <div className="space-y-4">
      <StepProgress steps={view.steps} />
      {view.tools.length > 0 ? (
        <div className="space-y-2">
          {view.tools.map((tool) => (
            <ExtractionCard key={tool.id} tool={tool} />
          ))}
        </div>
      ) : null}
      <BriefCopy markdown={view.text} />
      {view.errorText ? <StreamError message={view.errorText} /> : null}
      {fatal ? <StreamError message={fatal.message} /> : null}
    </div>
  );
}
