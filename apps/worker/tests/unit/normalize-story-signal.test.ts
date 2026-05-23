import { describe, expect, it } from "bun:test";
import { normalizeStorySignal } from "@mizan/mastra/steps/storyCoherence/index.ts";

/**
 * Pins clamp behaviour: `StoryCoherencePayloadSchema` documents a
 * caller-clamp contract on `named_entity_density` and
 * `template_match_score` (both must land in [0,1]). A regression that
 * removed the clamp would otherwise propagate out-of-band LLM scores
 * straight into `signals.payload_json`.
 */
describe("normalizeStorySignal", () => {
  it("clamps named_entity_density above 1 to 1", () => {
    const out = normalizeStorySignal({
      named_entity_density: 1.5,
      template_match_score: 0.5,
      coherence_summary: "ok",
    });
    expect(out.named_entity_density).toBe(1);
    expect(out.template_match_score).toBe(0.5);
  });

  it("clamps template_match_score below 0 to 0", () => {
    const out = normalizeStorySignal({
      named_entity_density: 0.4,
      template_match_score: -0.2,
      coherence_summary: "ok",
    });
    expect(out.template_match_score).toBe(0);
    expect(out.named_entity_density).toBe(0.4);
  });

  it("passes in-range scores through unchanged", () => {
    const out = normalizeStorySignal({
      named_entity_density: 0.42,
      template_match_score: 0.73,
      coherence_summary: "in range",
    });
    expect(out.named_entity_density).toBe(0.42);
    expect(out.template_match_score).toBe(0.73);
  });

  it("clamps both endpoints of [0,1] inclusive", () => {
    const out = normalizeStorySignal({
      named_entity_density: 1,
      template_match_score: 0,
      coherence_summary: "edges",
    });
    expect(out.named_entity_density).toBe(1);
    expect(out.template_match_score).toBe(0);
  });

  it("preserves coherence_summary verbatim", () => {
    const summary = "Multi-paragraph reviewer note with edge case characters: <>&\"'";
    const out = normalizeStorySignal({
      named_entity_density: 0.5,
      template_match_score: 0.5,
      coherence_summary: summary,
    });
    expect(out.coherence_summary).toBe(summary);
  });
});
