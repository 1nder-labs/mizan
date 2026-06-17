/**
 * Unit: brief-stream transport wiring.
 *
 * Pins the URL contract that page-reload resume depends on. `DefaultChatTransport`
 * is mocked to capture the options `buildTransport` passes, so we assert the
 * actual wiring — `api` → POST endpoint, `prepareReconnectToStreamRequest` →
 * the resume GET endpoint — not just the pure URL helpers. A route rename that
 * forgot to update `resumeApi`, or a `buildTransport` that dropped the reconnect
 * override, would fail here instead of silently breaking reload-resume.
 */
import { describe, expect, test, vi } from "vitest";

interface CapturedOptions {
  readonly api: string;
  readonly headers: Record<string, string>;
  readonly prepareSendMessagesRequest: () => { body: Record<string, unknown> };
  readonly prepareReconnectToStreamRequest: () => { api: string };
}

const { transportSpy } = vi.hoisted(() => ({ transportSpy: vi.fn() }));
vi.mock("ai", () => ({
  DefaultChatTransport: class {
    readonly options: CapturedOptions;
    constructor(options: CapturedOptions) {
      this.options = options;
      transportSpy(options);
    }
  },
}));

import { buildTransport, resumeApi, streamApi } from "../../src/components/brief/transport.ts";

describe("transport URL helpers", () => {
  test("streamApi builds the POST endpoint", () => {
    expect(streamApi("abc-123")).toBe("/api/cases/abc-123/brief");
  });

  test("resumeApi builds the resume GET endpoint", () => {
    expect(resumeApi("abc-123")).toBe("/api/cases/abc-123/brief/stream");
  });
});

describe("buildTransport wiring", () => {
  test("wires api to the POST endpoint and an empty body", () => {
    buildTransport("abc-123");
    const opts = transportSpy.mock.calls.at(-1)?.[0];
    expect(opts.api).toBe("/api/cases/abc-123/brief");
    expect(opts.headers).toEqual({ Accept: "text/event-stream" });
    expect(opts.prepareSendMessagesRequest()).toEqual({ body: {} });
  });

  test("wires prepareReconnectToStreamRequest to the resume GET endpoint", () => {
    buildTransport("abc-123");
    const opts = transportSpy.mock.calls.at(-1)?.[0];
    expect(opts.prepareReconnectToStreamRequest().api).toBe("/api/cases/abc-123/brief/stream");
  });
});
