import type { GoldCase } from "./schema.ts";
import { GoldCaseSchema } from "./schema.ts";
import fixtures from "./fixtures.json";

/**
 * Loads and validates the curated gold-set fixtures.
 *
 * Fails loud (throws) if `fixtures.json` is malformed or contains
 * schema-violating entries. Returns a typed, validated array.
 */
export function loadGoldSet(): GoldCase[] {
  return GoldCaseSchema.array().parse(fixtures);
}
