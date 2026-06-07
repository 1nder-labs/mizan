import { generateText } from "ai";
import { eq, chat_threads, type Db } from "@mizan/db";
import { resolveLanguageModel } from "@mizan/mastra";
import type { CloudflareBindings } from "../env.ts";

const DEFAULT_TITLE = "New conversation";
const MAX_TITLE_LEN = 80;

const TITLE_SYSTEM =
  "You name a chat conversation between a Trust & Safety reviewer and an assistant. " +
  "Return ONLY a concise 2–5 word title in Title Case capturing the core topic. " +
  "No quotes, no trailing punctuation, no emojis, no preamble, no explanation.";

/** Strips quotes/newlines and clamps the model's output to a clean short title. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/["'`\n\r]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LEN);
}

/**
 * Generates a conversation title from the first user message and persists it —
 * but only while the thread still carries the default placeholder, so it runs
 * once per thread. Best-effort: a failure logs and leaves the placeholder, never
 * breaking the chat turn. Call via `executionCtx.waitUntil` so it never blocks
 * the response stream.
 */
export async function maybeGenerateThreadTitle(
  env: CloudflareBindings,
  db: Db,
  threadId: string,
  firstUserText: string,
): Promise<void> {
  try {
    if (firstUserText.trim().length === 0) return;
    const current = await db
      .select({ title: chat_threads.title })
      .from(chat_threads)
      .where(eq(chat_threads.id, threadId))
      .get();
    if (current && current.title !== null && current.title !== DEFAULT_TITLE) return;
    const { model } = resolveLanguageModel({ kind: "extract", env });
    const { text } = await generateText({
      model,
      system: TITLE_SYSTEM,
      prompt: firstUserText.slice(0, 500),
    });
    const title = cleanTitle(text);
    if (title.length === 0) return;
    await db.update(chat_threads).set({ title }).where(eq(chat_threads.id, threadId)).run();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[chat] title generation failed (thread=${threadId}): ${reason}`);
  }
}
