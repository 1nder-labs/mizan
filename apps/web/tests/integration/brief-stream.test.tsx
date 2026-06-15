/**
 * Integration: BriefStream's failure-mode path and the onFinish →
 * invalidate contract.
 *
 * AI SDK 6 `useChat` is mocked at the module boundary so the test
 * controls the messages stream, the error payload, and the lifecycle
 * callbacks directly. The durable-resume design treats ALL errors
 * uniformly — there is no 409/InFlightNotice special-case any more (a
 * 204 from the resume-GET is a SDK no-op, and a terminal-case 409 just
 * invalidates so the parent flips to the persisted brief). We assert:
 *   - any fatal error renders the destructive alert
 *   - onFinish triggers invalidateQueries on the case-detail key
 *   - onError bubbles to onStreamError so the parent can flip its panel
 *     mode away from `stream`
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
  test("fatal error renders the destructive alert", async () => {
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

  test("onError bubbles to onStreamError so the parent flips off `stream`", async () => {
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
});
