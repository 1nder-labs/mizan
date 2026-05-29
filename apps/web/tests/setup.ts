/**
 * Vitest setup — JSDOM polyfills + RTL matchers. MSW server is set
 * up per-test file so handlers can be scoped tightly.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/** JSDOM lacks EventSource; live-events hooks no-op safely in integration tests. */
if (typeof globalThis.EventSource === "undefined") {
  class TestEventSource {
    readonly url: string;
    onerror: (() => void) | null = null;

    constructor(url: string) {
      this.url = url;
    }

    addEventListener(_type: string, _listener: (event: MessageEvent<string>) => void): void {}

    removeEventListener(_type: string, _listener: (event: MessageEvent<string>) => void): void {}

    close(): void {}
  }
  globalThis.EventSource = TestEventSource as typeof EventSource;
}

if (typeof globalThis.BroadcastChannel === "undefined") {
  class TestBroadcastChannel {
    readonly name: string;
    onmessage: ((event: MessageEvent<string>) => void) | null = null;

    constructor(name: string) {
      this.name = name;
    }

    postMessage(_data: string): void {}

    close(): void {}
  }
  globalThis.BroadcastChannel = TestBroadcastChannel as typeof BroadcastChannel;
}

if (typeof navigator !== "undefined" && !navigator.locks) {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_name: string, callback: () => Promise<void>) => {
        await callback();
      },
    },
  });
}
