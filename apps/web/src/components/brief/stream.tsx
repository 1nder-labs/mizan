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
 *
 * In-flight handling: when the case is already RUNNING from a prior
 * POST (Mode B consumer or another reviewer tab), the worker's
 * producer guard returns 409 with `{ "error": "case already running" }`.
 * This component detects that shape, shows an in-progress notice, and
 * polls the case-detail query so the surface flips to the persisted
 * brief the moment the other stream finishes.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { queryKeys } from "@/lib/query-keys.ts";
import { BriefCopy } from "./copy.tsx";
import { ExtractionCard } from "./extraction-card.tsx";
import { StepProgress } from "./step-progress.tsx";
import { foldParts } from "./stream-parts.ts";

interface BriefStreamProps {
  readonly caseId: string;
  /**
   * Fires once when the stream settles in an error state (worker
   * rejected the POST, transport failed, SSE closed unexpectedly).
   * Parent uses it to clear its userTriggered flag so the stream
   * component unmounts and the next Generate click gets a fresh
   * `useStreamOpener` ref — without it the stream would stay mounted
   * with status=DRAFT and the openedFor guard would block any retry.
   */
  readonly onStreamError?: () => void;
}

const ALREADY_RUNNING_RE = /case already running/i;
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_TICKS = 120;

function StreamError({ message }: { readonly message: string }): React.JSX.Element {
  return (
    <Alert variant="destructive">
      <AlertTitle>Brief stream failed</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function InFlightNotice({
  onRefresh,
  refreshing,
}: {
  readonly onRefresh: () => void;
  readonly refreshing: boolean;
}): React.JSX.Element {
  return (
    <Card className="border-border/80 shadow-elev-1">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-status-info-foreground" />
          <CardTitle className="text-sm font-medium">Composing brief</CardTitle>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Another session is already running the workflow for this case. The brief will appear
          here automatically when it finishes.
        </p>
      </CardContent>
    </Card>
  );
}

function streamApi(caseId: string): string {
  return `/api/cases/${caseId}/brief`;
}

/**
 * Mode A SSE transport.
 *
 * `prepareSendMessagesRequest` returns an empty body — the worker
 * (`apps/worker/src/routes/cases.ts`) reads inputs from URL params +
 * producer-guard context and does not consume the request body. The
 * AI SDK default wraps messages in `{ messages: [...] }` which the
 * worker would discard; an empty `{}` matches the contract exactly.
 * `Accept: text/event-stream` matches the worker's `wantsEventStream(c)`
 * content negotiation.
 *
 * `useChat`'s POST does not go through `apiMutate`: `DefaultChatTransport`
 * owns the stream request lifecycle and `hc<AppType>` doesn't model
 * SSE returns. Single-shot per runId is enforced by the worker's
 * producer-guard, so HTTP-level idempotency is redundant for this
 * endpoint.
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

/**
 * Polls the case-detail query on a fixed interval while another
 * session owns the workflow (409 in-flight). Interval is capped at
 * `POLL_MAX_TICKS * POLL_INTERVAL_MS` (10 min) so a stalled workflow
 * can't accumulate fetches indefinitely; the in-flight notice's
 * Refresh button is the manual fallback past the cap.
 */
function useCasePoll(caseId: string, enabled: boolean): boolean {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setRefreshing(false);
      return;
    }
    let ticks = 0;
    const handle = setInterval(() => {
      ticks += 1;
      if (ticks > POLL_MAX_TICKS) {
        clearInterval(handle);
        setRefreshing(false);
        return;
      }
      setRefreshing(true);
      void queryClient
        .invalidateQueries({
          queryKey: queryKeys.cases.detail(caseId),
          refetchType: "all",
        })
        .finally(() => setRefreshing(false));
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(handle);
      setRefreshing(false);
    };
  }, [caseId, enabled, queryClient]);
  return refreshing;
}

function isAlreadyRunning(message: string): boolean {
  return ALREADY_RUNNING_RE.test(message);
}

/**
 * Pure rendering of the live workflow output — step progress, tool
 * cards, brief markdown, any error events. Extracted from
 * `BriefStream` to keep the hook composition function thin and
 * preserve fast-refresh boundaries.
 */
function BriefStreamView({
  view,
  fatalMessage,
}: {
  readonly view: ReturnType<typeof foldParts>;
  readonly fatalMessage: string | null;
}): React.JSX.Element {
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
      {fatalMessage ? <StreamError message={fatalMessage} /> : null}
    </div>
  );
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
    onError: () => {
      void invalidateDetail();
      onStreamErrorRef.current?.();
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
  const fatalMessage = error?.message ?? (status === "error" ? "Stream closed unexpectedly" : null);
  const inflight =
    (view.errorText !== null && isAlreadyRunning(view.errorText)) ||
    (fatalMessage !== null && isAlreadyRunning(fatalMessage));

  const refreshing = useCasePoll(caseId, inflight);

  if (inflight) {
    return <InFlightNotice onRefresh={() => void invalidateDetail()} refreshing={refreshing} />;
  }
  return <BriefStreamView view={view} fatalMessage={fatalMessage} />;
}
