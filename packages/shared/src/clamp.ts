/**
 * Clamps an integer to [min, max]; truncates fractional values.
 */
export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
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
