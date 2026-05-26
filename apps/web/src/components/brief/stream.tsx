/**
 * Live brief stream — wires `useChat` against the worker's Mode A
 * SSE endpoint at `POST /api/cases/:id/brief`. The worker reads its
 * inputs from URL params + producer-guard context, so the canonical
 * stream-open trigger is `sendMessage({ text: '' })` on mount — the
 * empty payload is intentional, do NOT "fix" it.
 *
 * On `onFinish` we invalidate the case detail query so the parent
 * route re-fetches the persisted brief + flipped status. The derived
 * view (text, tools, steps) is folded each render via `foldParts` so
 * component state remains a pure function of streamed parts.
 *
 * In-flight handling: when the case is already RUNNING from a prior
 * POST, the worker's producer-guard returns 409 with
 * `{ "error": "case already running" }`. This component detects that
 * shape, overlays an in-progress notice above any partial progress
 * already streamed (instead of replacing it), and polls the case-detail
 * query so the surface flips to the persisted brief the moment the
 * other stream finishes.
 *
 * Orchestrator only: transport / opener / poll / view live in sibling
 * modules. Keep this file thin — it composes hooks and routes UI, it
 * does not own any of them.
 */
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { queryKeys } from "@/lib/query-keys.ts";
import { foldParts, type FoldedStream } from "./stream-parts.ts";
import { buildTransport } from "./transport.ts";
import { useStreamOpener } from "./use-stream-opener.ts";
import { useInflightPoll } from "./use-inflight-poll.ts";
import { InFlightNotice } from "./inflight-notice.tsx";
import { BriefStreamView } from "./stream-view.tsx";

interface BriefStreamProps {
  readonly caseId: string;
  /**
   * Fires once when the stream settles in an error state (worker
   * rejected the POST, transport failed, SSE closed unexpectedly).
   * Parent uses it to flip its derived panel mode away from
   * `stream` so the reviewer gets a retry CTA instead of a frozen
   * view. Does NOT fire on a 409 in-flight signal — that's not a
   * failure, the poll loop owns recovery.
   */
  readonly onStreamError?: () => void;
}

const ALREADY_RUNNING_RE = /case already running/i;

function isAlreadyRunning(message: string): boolean {
  return ALREADY_RUNNING_RE.test(message);
}

interface StreamSignals {
  readonly view: FoldedStream;
  readonly fatalMessage: string | null;
  readonly inflight: boolean;
}

function deriveSignals(
  view: FoldedStream,
  errorMessage: string | null,
  status: string,
): StreamSignals {
  const fatalRaw = errorMessage ?? (status === "error" ? "Stream closed unexpectedly" : null);
  const inflight =
    (view.errorText !== null && isAlreadyRunning(view.errorText)) ||
    (fatalRaw !== null && isAlreadyRunning(fatalRaw));
  const fatalMessage = inflight ? null : fatalRaw;
  return { view, fatalMessage, inflight };
}

export function BriefStream({ caseId, onStreamError }: BriefStreamProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const transport = useMemo(() => buildTransport(caseId), [caseId]);
  const invalidateDetail = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.cases.detail(caseId),
      refetchType: "all",
    });
  }, [caseId, queryClient]);
  const onStreamErrorRef = useRef(onStreamError);
  useEffect(() => {
    onStreamErrorRef.current = onStreamError;
  }, [onStreamError]);

  const { messages, sendMessage, error, status } = useChat({
    id: `case-${caseId}`,
    transport,
    onFinish: invalidateDetail,
    onError: (err) => {
      void invalidateDetail();
      if (!isAlreadyRunning(err.message)) onStreamErrorRef.current?.();
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
  const { fatalMessage, inflight } = deriveSignals(view, error?.message ?? null, status);
  const refreshing = useInflightPoll(caseId, inflight);

  return (
    <div className="space-y-4">
      {inflight ? (
        <InFlightNotice onRefresh={() => void invalidateDetail()} refreshing={refreshing} />
      ) : null}
      <BriefStreamView view={view} fatalMessage={fatalMessage} />
    </div>
  );
}
