/**
 * Integration: BriefStream's two failure-mode paths and the
 * onFinish → invalidate contract.
 *
 * AI SDK 6 `useChat` is mocked at the module boundary so the test
 * controls the messages stream, the error payload, and the lifecycle
 * callbacks directly. We assert:
 *   - 409 "case already running" payload renders InFlightNotice
 *     overlaid above any partial stream view
 *   - onFinish triggers invalidateQueries on the case-detail key
 *   - normal error (non-409) bubbles to onStreamError so the parent
 *     can flip its panel mode away from `stream`
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface UseChatOptions {
  readonly id?: string;
  readonly transport?: unknown;
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

const { useChatMock } = vi.hoisted(() => ({ useChatMock: vi.fn() }));
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: UseChatOptions) => useChatMock(opts),
}));

import { BriefStream } from "../../src/components/brief/stream.tsx";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

function makeChat(overrides: Partial<UseChatReturn>): UseChatReturn {
  return {
    messages: [],
    sendMessage: vi.fn(),
    error: undefined,
    status: "ready",
    ...overrides,
  };
}

function renderStream(onStreamError?: () => void): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BriefStream caseId={CASE_ID} onStreamError={onStreamError} />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("<BriefStream />", () => {
  test("409 in-flight renders InFlightNotice overlay", async () => {
    useChatMock.mockImplementation(() =>
      makeChat({
        error: new Error("case already running"),
        status: "error",
      }),
    );
    const onStreamError = vi.fn();
    renderStream(onStreamError);
    expect(
      await screen.findByText(/another session is already running the workflow/i),
    ).toBeInTheDocument();
    expect(onStreamError).not.toHaveBeenCalled();
  });

  test("non-409 fatal error renders the destructive alert", async () => {
    useChatMock.mockImplementation(() =>
      makeChat({
        error: new Error("upstream LLM down"),
        status: "error",
      }),
    );
    renderStream();
    expect(await screen.findByText(/brief stream failed/i)).toBeInTheDocument();
    expect(screen.getByText(/upstream LLM down/i)).toBeInTheDocument();
    expect(screen.queryByText(/another session is already running/i)).toBeNull();
  });

  test("onFinish callback invalidates the case-detail query", async () => {
    let capturedOnFinish: (() => Promise<void>) | undefined;
    useChatMock.mockImplementation((opts: UseChatOptions) => {
      capturedOnFinish = opts.onFinish as () => Promise<void>;
      return makeChat({ status: "ready" });
    });
    const queryClient = renderStream();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    if (!capturedOnFinish) throw new Error("onFinish not captured");
    await capturedOnFinish();
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["cases", "detail", CASE_ID],
        refetchType: "all",
      }),
    );
  });

  test("onError with non-409 calls onStreamError", async () => {
    let capturedOnError: ((err: Error) => void) | undefined;
    useChatMock.mockImplementation((opts: UseChatOptions) => {
      capturedOnError = opts.onError;
      return makeChat({ status: "ready" });
    });
    const onStreamError = vi.fn();
    renderStream(onStreamError);
    if (!capturedOnError) throw new Error("onError not captured");
    capturedOnError(new Error("transport failed"));
    await waitFor(() => expect(onStreamError).toHaveBeenCalledTimes(1));
  });

  test("onError with 409 does NOT call onStreamError", async () => {
    let capturedOnError: ((err: Error) => void) | undefined;
    useChatMock.mockImplementation((opts: UseChatOptions) => {
      capturedOnError = opts.onError;
      return makeChat({ status: "ready" });
    });
    const onStreamError = vi.fn();
    renderStream(onStreamError);
    if (!capturedOnError) throw new Error("onError not captured");
    capturedOnError(new Error("case already running"));
    expect(onStreamError).not.toHaveBeenCalled();
  });
});
