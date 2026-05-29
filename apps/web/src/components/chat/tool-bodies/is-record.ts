/** Narrows unknown tool output to a string-keyed record before field access. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
