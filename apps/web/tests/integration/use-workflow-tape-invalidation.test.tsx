/**
 * Integration: useWorkflowTapeInvalidation EventSource hook.
 */
import { describe, expect, test, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWorkflowTapeInvalidation } from "../../src/components/brief/use-workflow-tape-invalidation.ts";
import { queryKeys } from "../../src/lib/query-keys.ts";

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: string): void {
    const handlers = this.listeners.get(type) ?? [];
    for (const handler of handlers) {
      handler({ data } as MessageEvent<string>);
    }
  }
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useWorkflowTapeInvalidation", () => {
  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
  });

  test("opens EventSource at /api/cases/:id/stream when enabled", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    renderHook(() => useWorkflowTapeInvalidation("case-1", true), {
      wrapper: wrapper(queryClient),
    });
    expect(MockEventSource.instances[0]?.url).toBe("/api/cases/case-1/stream");
  });

  test("does not construct EventSource when disabled", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    renderHook(() => useWorkflowTapeInvalidation("case-1", false), {
      wrapper: wrapper(queryClient),
    });
    expect(MockEventSource.instances).toHaveLength(0);
  });

  test("invalidates case detail on workflow.finish + closes the source", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useWorkflowTapeInvalidation("case-1", true), {
      wrapper: wrapper(queryClient),
    });
    const source = MockEventSource.instances[0];
    source?.emit(
      "workflow.finish",
      JSON.stringify({
        seq: 4,
        event_type: "workflow.finish",
        emitted_at: 1,
        payload_meta: {
          caseId: "550e8400-e29b-41d4-a716-446655440001",
          runId: "550e8400-e29b-41d4-a716-446655440002",
        },
      }),
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.cases.detail("case-1"),
        refetchType: "all",
      });
    });
    expect(source?.closed).toBe(true);
  });

  test("ignores malformed JSON frames without throwing", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useWorkflowTapeInvalidation("case-1", true), {
      wrapper: wrapper(queryClient),
    });
    const source = MockEventSource.instances[0];
    expect(() => source?.emit("workflow.finish", "{not-json")).not.toThrow();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  test("closes EventSource on error event (cancels native reconnect)", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    renderHook(() => useWorkflowTapeInvalidation("case-1", true), {
      wrapper: wrapper(queryClient),
    });
    const source = MockEventSource.instances[0];
    source?.onerror?.();
    expect(source?.closed).toBe(true);
  });
});
