/**
 * Clamps an integer to [min, max]; truncates fractional values.
 * Non-finite inputs (NaN, ±Infinity) collapse to `min` so a malformed
 * LLM emission cannot smuggle a NaN through to persisted state. Pass-9
 * review flagged this as a claimed-but-missing fix; the guard now
 * actually lands.
 */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Clamps a finite number to the [0, 1] interval. Non-finite values
 * (NaN, ±Infinity) collapse to 0 so downstream consumers do not have to
 * defend against malformed LLM output mid-prompt.
 */
export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Throws if value is not a valid UUID shape; returns it otherwise.
 */
export function ensureUuid(value: string, field: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${field} is not a valid UUID: ${value}`);
  }
  return value;
}
