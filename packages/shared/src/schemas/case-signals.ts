import { z } from "zod";
import { PhotoSignalPayloadSchema } from "./photo-signal.ts";
import { StoryCoherencePayloadSchema } from "./brief.ts";
import { VouchingChainVariantSchema } from "./vouching.ts";

/**
 * Response shape for `GET /api/cases/:id/signals` — Phase 7.5 U6.
 * Returns the latest persisted signal per `signal_type` for one case.
 *
 * Signal type enum mirrors `packages/db/src/schema.ts` (`signals.signal_type`)
 * but only the three types the workflow currently persists are passed
 * through structured payload validation (`photo_dup`, `story_coherence`,
 * `vouching_chain`). The remaining DB enum values are reserved for
 * future workflow steps; they are listed here so an unexpected row
 * deserialises without crashing the route, but their `payload_json` is
 * accepted as opaque JSON (validated upstream when the producer
 * exists).
 */
export const SignalTypeEnum = z.enum([
  "photo_dup",
  "story_coherence",
  "vouching_chain",
  "registry_lookup",
  "sanctions_screen",
  "ocr_mismatch",
]);

export type SignalType = z.infer<typeof SignalTypeEnum>;

const PhotoDupSignalSchema = z.object({
  signal_type: z.literal("photo_dup"),
  payload_json: PhotoSignalPayloadSchema,
  recorded_at: z.number().int(),
  run_id: z.string().uuid(),
});

const StoryCoherenceSignalSchema = z.object({
  signal_type: z.literal("story_coherence"),
  payload_json: StoryCoherencePayloadSchema,
  recorded_at: z.number().int(),
  run_id: z.string().uuid(),
});

const VouchingChainSignalSchema = z.object({
  signal_type: z.literal("vouching_chain"),
  payload_json: VouchingChainVariantSchema,
  recorded_at: z.number().int(),
  run_id: z.string().uuid(),
});

const OpaqueSignalSchema = z.object({
  signal_type: z.enum(["registry_lookup", "sanctions_screen", "ocr_mismatch"]),
  payload_json: z.unknown(),
  recorded_at: z.number().int(),
  run_id: z.string().uuid(),
});

export const CaseSignalEntrySchema = z.discriminatedUnion("signal_type", [
  PhotoDupSignalSchema,
  StoryCoherenceSignalSchema,
  VouchingChainSignalSchema,
  OpaqueSignalSchema,
]);

export const CaseSignalsResponseSchema = z
  .object({
    signals: z.array(CaseSignalEntrySchema),
  })
  .strict();

export type CaseSignalEntry = z.infer<typeof CaseSignalEntrySchema>;
export type CaseSignalsResponse = z.infer<typeof CaseSignalsResponseSchema>;
