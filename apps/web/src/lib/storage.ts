/**
 * Reusable typed `localStorage` wrapper. Reads are validated by a caller-
 * supplied zod schema — `localStorage` is an untrusted boundary (another tab,
 * an older app version, or a user could have written anything), so a value that
 * fails to parse or validate is treated as absent rather than trusted. Writes
 * JSON-encode. Keep DOM storage access funnelled through here so persistence is
 * consistent + testable across the app.
 */
import type { ZodType } from "zod";

/** Parses JSON, returning null for malformed input (treated as absent). */
function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readStored<T>(key: string, schema: ZodType<T>): T | undefined {
  const raw = localStorage.getItem(key);
  if (raw === null) return undefined;
  const result = schema.safeParse(parseJsonSafe(raw));
  return result.success ? result.data : undefined;
}

export function writeStored<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeStored(key: string): void {
  localStorage.removeItem(key);
}
