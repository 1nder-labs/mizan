/**
 * Integration: BriefStream's durable-resume contract + failure-mode paths.
 *
 * AI SDK 6 `useChat` is mocked at the module boundary so the test controls the
 * options it receives, the lifecycle callbacks, and a STABLE `sendMessage` spy
 * (returned identically on every render) so mount-time POST behaviour can be
 * counted across re-renders. The durable-resume design treats ALL errors
 * uniformly (no 409/InFlightNotice special-case). We assert:
 *   - `resume: true` is passed to useChat (page-reload reconnect contract)
 *   - autoStart:true fires exactly one `sendMessage({ text: "" })` and is
 *     idempotent across re-renders of the same caseId (startedRef guard)
 *   - autoStart:false never POSTs (resume-GET-only)
 *   - changing caseId fires a fresh POST (startedRef resets)
 *   - any fatal error renders the destructive alert
 *   - onFinish invalidates the case-detail query; onError bubbles to onStreamError
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface UseChatOptions {
  readonly id?: string;
  readonly transport?: unknown;
  readonly resume?: boolean;
  readonly onFinish?: (() => void) | undefined;
  readonly onError?: ((err: Error) => void) | undefined;
}

interface UseChatReturn {
  readonly messages: ReadonlyArray<{
    readonly role: "user" | "assistant";
    readonly parts: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  }>;
  readonly sendMessage: (input: { text: string }) => void;
  readonly error: Error | undefined;
  readonly status: "idle" | "submitted" | "streaming" | "ready" | "error";
}

/**
 * `sendMessageSpy` is hoisted + stable across every useChat call so the
 * component's `startedRef` effect (dep: `sendMessage`) does not re-fire from a
 * changing function identity — only from caseId/autoStart changes. Cleared in
 * beforeEach so per-test call counts are exact.
 */
const { useChatMock, sendMessageSpy } = vi.hoisted(() => ({
  useChatMock: vi.fn(),
  sendMessageSpy: vi.fn(),
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: UseChatOptions) => useChatMock(opts),
}));

import { BriefStream } from "../../src/components/brief/stream.tsx";

const CASE_A = "11111111-1111-4111-8111-111111111111";
const CASE_B = "22222222-2222-4222-8222-222222222222";

function makeChat(overrides: Partial<UseChatReturn>): UseChatReturn {
  return {
    messages: [],
    sendMessage: sendMessageSpy,
    error: undefined,
    status: "ready",
    ...overrides,
  };
}

function withClient(node: React.ReactNode): { ui: React.ReactElement; queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ui: <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  };
}

beforeEach(() => {
  useChatMock.mockReset();
  sendMessageSpy.mockReset();
  useChatMock.mockImplementation(() => makeChat({}));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("<BriefStream /> durable-resume contract", () => {
  test("passes resume:true to useChat (page-reload reconnect)", () => {
    const { ui } = withClient(<BriefStream caseId={CASE_A} autoStart={false} />);
    render(ui);
    const opts = useChatMock.mock.calls.at(-1)?.[0];
    expect(opts?.resume).toBe(true);
  });

  test("autoStart:true fires exactly one sendMessage({text:''}) and is idempotent on re-render", () => {
    const { ui } = withClient(<BriefStream caseId={CASE_A} autoStart={true} />);
    const { rerender } = render(ui);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).toHaveBeenCalledWith({ text: "" });

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <BriefStream caseId={CASE_A} autoStart={true} />
      </QueryClientProvider>,
    );
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
  });

  test("autoStart:false never POSTs (resume-GET only)", () => {
    const { ui } = withClient(<BriefStream caseId={CASE_A} autoStart={false} />);
    render(ui);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  test("changing caseId fires a fresh sendMessage (startedRef resets)", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <BriefStream caseId={CASE_A} autoStart={true} />
      </QueryClientProvider>,
    );
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={client}>
        <BriefStream caseId={CASE_B} autoStart={true} />
      </QueryClientProvider>,
    );
    expect(sendMessageSpy).toHaveBeenCalledTimes(2);
  });
});

describe("<BriefStream /> failure + lifecycle", () => {
  test("fatal error renders the destructive alert", async () => {
    useChatMock.mockImplementation(() =>
      makeChat({ error: new Error("upstream LLM down"), status: "error" }),
    );
    const { ui } = withClient(<BriefStream caseId={CASE_A} autoStart={false} />);
    render(ui);
    expect(await screen.findByText(/brief stream failed/i)).toBeInTheDocument();
    expect(screen.getByText(/upstream LLM down/i)).toBeInTheDocument();
  });

  test("onFinish invalidates the case-detail query", async () => {
    let capturedOnFinish: (() => Promise<void>) | undefined;
    useChatMock.mockImplementation((opts: UseChatOptions) => {
      capturedOnFinish = opts.onFinish as () => Promise<void>;
      return makeChat({});
    });
    const { ui, queryClient } = withClient(<BriefStream caseId={CASE_A} autoStart={false} />);
    render(ui);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    if (!capturedOnFinish) throw new Error("onFinish not captured");
    await capturedOnFinish();
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["cases", "detail", CASE_A], refetchType: "all" }),
    );
  });

  test("onError bubbles to onStreamError so the parent flips off `stream`", async () => {
    let capturedOnError: ((err: Error) => void) | undefined;
    useChatMock.mockImplementation((opts: UseChatOptions) => {
      capturedOnError = opts.onError;
      return makeChat({});
    });
    const onStreamError = vi.fn();
    const { ui } = withClient(
      <BriefStream caseId={CASE_A} autoStart={false} onStreamError={onStreamError} />,
    );
    render(ui);
    if (!capturedOnError) throw new Error("onError not captured");
    capturedOnError(new Error("transport failed"));
    await waitFor(() => expect(onStreamError).toHaveBeenCalledTimes(1));
  });
});
