/**
 * Integration: subscribeLiveEvents lifecycle, dispatch, and schema-fail handling.
 */
import { describe, expect, test, vi, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { subscribeLiveEvents } from "../../src/hooks/live-events-subscribe.ts";
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

class MockBroadcastChannel {
  static channels = new Map<string, MockBroadcastChannel>();
  readonly name: string;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.channels.set(name, this);
  }

  postMessage(data: string): void {
    const channel = MockBroadcastChannel.channels.get(this.name);
    channel?.onmessage?.({ data } as MessageEvent<string>);
  }

  close(): void {
    MockBroadcastChannel.channels.delete(this.name);
  }
}

describe("subscribeLiveEvents", () => {
  afterEach(() => {
    MockEventSource.instances = [];
    MockBroadcastChannel.channels.clear();
    vi.unstubAllGlobals();
  });

  test("opens EventSource for org topic when locks are unavailable", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    vi.stubGlobal("navigator", { locks: undefined });
    const queryClient = new QueryClient();
    const cleanup = subscribeLiveEvents("org:org-1", queryClient, undefined, true);
    await waitFor(() => {
      expect(MockEventSource.instances[0]?.url).toBe("/api/events/stream?topic=org%3Aorg-1");
    });
    cleanup();
    expect(MockEventSource.instances[0]?.closed).toBe(true);
  });

  test("invalidates cases queries on case.status_changed", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    vi.stubGlobal("navigator", { locks: undefined });
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    subscribeLiveEvents("org:org-1", queryClient, undefined, true);
    const source = MockEventSource.instances[0];
    source?.emit(
      "case.status_changed",
      JSON.stringify({
        topic: "org:org-1",
        seq: 1,
        event_type: "case.status_changed",
        payload: {
          event_type: "case.status_changed",
          case_id: "case-1",
          from_status: "DRAFT",
          to_status: "QUEUED",
        },
        emitted_at: Date.now(),
        actor_user_id: "user-1",
        organization_id: "org-1",
      }),
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.cases.lists,
        refetchType: "all",
      });
    });
  });

  test("skips schema-invalid rows without closing the source", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    vi.stubGlobal("navigator", { locks: undefined });
    const queryClient = new QueryClient();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    subscribeLiveEvents("org:org-1", queryClient, undefined, true);
    const source = MockEventSource.instances[0];
    source?.emit("case.status_changed", JSON.stringify({ bad: true }));
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    expect(source?.closed).toBe(false);
    errorSpy.mockRestore();
  });
});
