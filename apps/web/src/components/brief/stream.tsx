/**
 * Live brief stream — wires `useChat` against the worker's durable
 * SSE endpoints:
 *   POST /api/cases/:id/brief  — enqueue/rejoin and stream live SSE
 *   GET  /api/cases/:id/brief/stream — reconnect/resume buffered SSE
 *
 * With `resume: true` the SDK fires a GET to the resume endpoint on
 * mount. A 204 (no active run) is a SDK-level no-op — it does NOT
 * call `onError`. This makes it safe to always mount `BriefStream`
 * for in-flight cases: a reload gets the buffered stream via GET,
 * while a user-initiated generate POSTs a new run.
 *
 * `autoStart` gates the mount-time POST. Set `false` when the parent
 * already knows a run is in flight (RUNNING / QUEUED) so we rely on
 * resume-GET rather than POSTing a duplicate request. Set `true` only
 * when the reviewer explicitly clicked Generate.
 *
 * The worker returns 409 ONLY for terminal cases (SUSPENDED_HITL /
 * ACTIONED) whose brief is already persisted. `onError` handles that
 * by invalidating the case-detail query so the parent flips to the
 * persisted-brief panel.
 *
 * Orchestrator only: transport / stream-view live in sibling modules.
 * Keep this file thin — it composes hooks and routes UI, it does not
 * own any of them.
 */
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { queryKeys } from "@/lib/query-keys.ts";
import { foldParts, type FoldedStream } from "./stream-parts.ts";
import { buildTransport } from "./transport.ts";
import { BriefStreamView } from "./stream-view.tsx";

interface BriefStreamProps {
  readonly caseId: string;
  /**
   * When true the component fires `sendMessage({ text: '' })` on mount
   * to POST a new (or rejoined) brief run. Set false when the case is
   * already in-flight and we want resume-GET to reconnect instead of
   * issuing a redundant POST.
   */
  readonly autoStart: boolean;
  /**
   * Fires once when the stream settles in an error state (worker
   * rejected the POST for a terminal case, or SSE closed unexpectedly).
   * Parent uses it to flip its derived panel mode away from `stream`
   * so the reviewer gets the persisted brief or a retry CTA instead of
   * a frozen view.
   */
  readonly onStreamError?: () => void;
}

interface StreamSignals {
  readonly view: FoldedStream;
  readonly fatalMessage: string | null;
}

function deriveSignals(
  view: FoldedStream,
  errorMessage: string | null,
  status: string,
): StreamSignals {
  const fatalMessage = errorMessage ?? (status === "error" ? "Stream closed unexpectedly" : null);
  return { view, fatalMessage };
}

export function BriefStream({
  caseId,
  autoStart,
  onStreamError,
}: BriefStreamProps): React.JSX.Element {
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
    resume: true,
    onFinish: invalidateDetail,
    onError: () => {
      void invalidateDetail();
      onStreamErrorRef.current?.();
    },
  });

  const startedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoStart) return;
    if (startedRef.current === caseId) return;
    startedRef.current = caseId;
    void sendMessage({ text: "" });
  }, [caseId, autoStart, sendMessage]);

  const assistantParts = useMemo(
    () => messages.flatMap((message) => (message.role === "assistant" ? message.parts : [])),
    [messages],
  );
  const view = useMemo(() => foldParts(assistantParts), [assistantParts]);
  const { fatalMessage } = deriveSignals(view, error?.message ?? null, status);

  return (
    <div className="space-y-3">
      <BriefStreamView view={view} fatalMessage={fatalMessage} />
    </div>
  );
}
