/**
 * Integration: useWorkflowEvents EventSource hook.
 */
import { describe, expect, test, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWorkflowEvents } from "../../src/components/brief/use-workflow-events.ts";
import { queryKeys } from "../../src/lib/query-keys.ts";

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
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
    /* noop for tests */
  }

  emit(type: string, data: string): void {
    const handlers = this.listeners.get(type) ?? [];
    for (const handler of handlers) {
      handler({ data } as MessageEvent<string>);
    }
  }

  open(): void {
    this.onopen?.();
  }
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useWorkflowEvents", () => {
  afterEach(() => {
    MockEventSource.instances = [];
    vi.unstubAllGlobals();
  });

  test("opens EventSource for RUNNING cases when enabled", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useWorkflowEvents("case-1", true), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.connected).toBe(false));
    expect(MockEventSource.instances[0]?.url).toBe("/api/cases/case-1/stream");
    MockEventSource.instances[0]?.open();
    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  test("does not construct EventSource when disabled", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    renderHook(() => useWorkflowEvents("case-1", false), {
      wrapper: wrapper(queryClient),
    });
    expect(MockEventSource.instances).toHaveLength(0);
  });

  test("invalidates case detail on workflow.finish", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useWorkflowEvents("case-1", true), {
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
  });
});
