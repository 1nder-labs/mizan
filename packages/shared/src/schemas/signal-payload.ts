import type { OcrMismatchPayload } from "./ocr-mismatch.ts";
import type { PhotoSignalPayload } from "./photo-signal.ts";
import type { StoryCoherencePayload } from "./brief.ts";
import type { VouchingChain } from "./vouching.ts";

/**
 * Discriminant-aware union of signal payloads emitted by the trust-signal steps
 * (`photo_dup`, `story_coherence`, `vouching_chain`, `ocr_mismatch`).
 * `registry_lookup` + `sanctions_screen` remain reserved DB enum values with no
 * producer (read back as opaque JSON); they are deliberately not in this union.
 *
 * Persisted in `signals.payload_json` — `@mizan/db` brands the column
 * with this type so the row-level shape contract is shared by every
 * package that reads from or writes to D1.
 */
export type SignalPayload =
  | PhotoSignalPayload
  | StoryCoherencePayload
  | VouchingChain
  | OcrMismatchPayload;
