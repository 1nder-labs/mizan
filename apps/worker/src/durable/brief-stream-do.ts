/**
 * Resumable brief-stream STORE — one Durable Object per brief `runId`.
 *
 * This is the Workers-native substitute for the AI SDK resumable-stream Redis
 * store (PRD §Phase-10). It is a DUMB BROKER: it does NOT run the Mastra
 * workflow (that stays in the durable Mode-B queue consumer, per
 * `docs/solutions/best-practices/cloudflare-queues-mode-b-background-engineering.md`
 * — running the workflow engine + D1Store inside a DO is the divergence we
 * deliberately avoid). The DO only:
 *   - INGESTS the SSE byte stream the consumer produces from `run.stream()`,
 *     buffering every chunk in DO SQLite storage (durable across eviction),
 *   - BROADCASTS each chunk live to all connected subscribers,
 *   - REPLAYS the buffer + tails live to any subscriber that connects or
 *     reconnects (the AI SDK reconciles UIMessage parts by id, so a full replay
 *     is idempotent — that's what makes `useChat({ resume: true })` seamless).
 *
 * An in-flight ingest (the consumer's open request) or an open subscriber keeps
 * the DO alive, so no heartbeat alarm is needed; once finished + idle it
 * hibernates with the buffer persisted for a late reconnect. No `@mizan/mastra`
 * import — the worker's static fetch entry graph stays trivially light.
 */
import { DurableObject } from "cloudflare:workers";
import type { CloudflareBindings } from "@mizan/shared";

const STORAGE_KEYS = {
  done: "done",
  chunkPrefix: "chunk:",
  chunkCount: "chunkCount",
} as const;

/** Cloudflare caps `storage.get(keys[])` at 128 keys per call — hydrate batches to this. */
const STORAGE_GET_BATCH = 128;

type Subscriber = {
  readonly enqueue: (text: string) => void;
  readonly close: () => void;
};

/** One instance per `runId`. The DO runs single-threaded, so buffer + subscriber set need no locking. */
export class BriefStreamDO extends DurableObject<CloudflareBindings> {
  private buffer: string[] = [];
  private subscribers = new Set<Subscriber>();
  private finished = false;
  private hydrated = false;

  /**
   * Loads any persisted buffer/flag so a re-instantiated (evicted) DO can still
   * replay + resume. Reads in ≤128-key batches — `storage.get(keys[])` caps at
   * 128, so a long brief (hundreds of chunks) would otherwise throw or silently
   * truncate, corrupting the buffer.
   */
  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    const count = (await this.ctx.storage.get<number>(STORAGE_KEYS.chunkCount)) ?? 0;
    const loaded: string[] = [];
    for (let start = 0; start < count; start += STORAGE_GET_BATCH) {
      const keys = Array.from(
        { length: Math.min(STORAGE_GET_BATCH, count - start) },
        (_, i) => `${STORAGE_KEYS.chunkPrefix}${start + i}`,
      );
      const stored = await this.ctx.storage.get<string>(keys);
      for (const k of keys) loaded.push(stored.get(k) ?? "");
    }
    this.buffer = loaded;
    this.finished = (await this.ctx.storage.get<boolean>(STORAGE_KEYS.done)) ?? false;
  }

  /**
   * Appends a chunk to the durable buffer and fans it out to live subscribers.
   * A subscriber whose controller has already closed (client disconnected
   * between the read and its `cancel`) throws on `enqueue` — we drop it instead
   * of letting one dead connection break the broadcast for everyone else.
   */
  private async append(text: string): Promise<void> {
    const index = this.buffer.length;
    this.buffer.push(text);
    await this.ctx.storage.put({
      [`${STORAGE_KEYS.chunkPrefix}${index}`]: text,
      [STORAGE_KEYS.chunkCount]: index + 1,
    });
    for (const sub of this.subscribers) {
      try {
        sub.enqueue(text);
      } catch {
        this.subscribers.delete(sub);
      }
    }
  }

  /** Marks the stream finished, persists the flag, and closes every open subscriber. */
  private async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.ctx.storage.put(STORAGE_KEYS.done, true);
    for (const sub of this.subscribers) sub.close();
    this.subscribers.clear();
  }

  /**
   * Opens a subscriber stream — replays the full buffer so far (idempotent for
   * the AI SDK client) then tails live chunks until the stream finishes. Same
   * contract for the initial Generate and a reload/resume, which is what makes
   * `useChat({ resume: true })` seamless.
   */
  private buildSubscriberStream(): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const replay = [...this.buffer];
    const finished = this.finished;
    const subscribers = this.subscribers;
    let registered: Subscriber | null = null;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of replay) controller.enqueue(encoder.encode(chunk));
        if (finished) {
          controller.close();
          return;
        }
        const sub: Subscriber = {
          enqueue: (text) => controller.enqueue(encoder.encode(text)),
          close: () => controller.close(),
        };
        subscribers.add(sub);
        registered = sub;
      },
      /**
       * The reviewer disconnected (tab close, navigate, reload). Drop the
       * subscriber so the broadcast loop stops enqueueing into a dead controller
       * and the set can't grow unbounded across reconnects. The run itself keeps
       * going in the consumer — this only detaches the live view.
       */
      cancel() {
        if (registered) subscribers.delete(registered);
      },
    });
  }

  /**
   * HTTP entry (addressed by `runId`). Everything crosses the DO boundary as
   * either a plain string body or a `Uint8Array` byte stream — both universal
   * across the workers-types/DOM type split, so no RPC generic + no cast:
   *
   *   - `POST ?op=publish` (text body)  — the consumer relays one SSE chunk;
   *     buffer + broadcast it.
   *   - `POST ?op=finish`               — the consumer signals the run ended;
   *     close subscribers.
   *   - `GET`                           — a reviewer subscribes (replay + live).
   */
  override async fetch(request: Request): Promise<Response> {
    await this.hydrate();
    if (request.method === "POST") {
      const op = new URL(request.url).searchParams.get("op");
      if (op === "publish" && !this.finished) await this.append(await request.text());
      if (op === "finish") await this.finish();
      return new Response(null, { status: 204 });
    }
    return new Response(this.buildSubscriberStream(), { headers: SSE_HEADERS });
  }
}

/**
 * SSE headers. `Content-Encoding: identity` opts the stream out of Cloudflare
 * edge compression, which otherwise buffers the whole body before flushing.
 */
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Content-Encoding": "identity",
} as const;
