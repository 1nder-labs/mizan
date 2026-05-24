import type { ExecutionContext, Message, MessageBatch } from "@cloudflare/workers-types";

/**
 * Builds a Miniflare-compatible queue message for unit/integration tests.
 * `attempts` defaults to 1 (first delivery); pass `>= 2` to simulate
 * crash-recovery redelivery in `classifyRedelivery` coverage.
 */
export function makeTestMessage(
  body: unknown,
  hooks?: { ack?: () => void; retry?: () => void; attempts?: number },
): Message<unknown> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    body,
    attempts: hooks?.attempts ?? 1,
    ack: hooks?.ack ?? (() => {}),
    retry: hooks?.retry ?? (() => {}),
  };
}

export function makeTestBatch(
  messages: Message<unknown>[],
  queue = "mizan-brief-jobs",
): MessageBatch<unknown> {
  return {
    queue,
    messages,
    retryAll: () => {},
    ackAll: () => {},
    metadata: {
      metrics: {
        backlogCount: messages.length,
        backlogBytes: 0,
      },
    },
  };
}

export function makeTestExecutionContext(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
  };
}
