import type { PhotoSignalPayload } from "./photo-signal.ts";
import type { StoryCoherencePayload } from "./brief.ts";
import type { VouchingChain } from "./vouching.ts";

/**
 * Discriminant-aware union of signal payloads currently emitted by
 * Phase 4 steps. Future signals (registry_lookup, sanctions_screen,
 * ocr_mismatch) extend this union when their steps ship.
 *
 * Persisted in `signals.payload_json` — `@mizan/db` brands the column
 * with this type so the row-level shape contract is shared by every
 * package that reads from or writes to D1.
 */
export type SignalPayload = PhotoSignalPayload | StoryCoherencePayload | VouchingChain;
