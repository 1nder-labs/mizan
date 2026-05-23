import { describe, expect, it } from "bun:test";
import { mergeParallelSignals } from "@mizan/mastra/testing";
import type {
  PartialBriefState,
  PhotoSignalPayload,
  StoryCoherencePayload,
  VouchingChain,
} from "@mizan/mastra";

const CLASSIFY = {
  category: "emergency_relief",
  verification_path: "documentary" as const,
  geography_tier: "OFAC_ADJACENT" as const,
};

const PHOTO: PhotoSignalPayload = {
  creator_id: {
    reverseImage: { hits: [], checked_at: "2026-05-21T00:00:00.000Z" },
    aiGen: { probability: "low", model: "stub-v1" },
  },
  category_doc: {
    reverseImage: { hits: [], checked_at: "2026-05-21T00:00:00.000Z" },
    aiGen: { probability: "low", model: "stub-v1" },
  },
};

const STORY: StoryCoherencePayload = {
  named_entity_density: 0.6,
  template_match_score: 0.7,
  coherence_summary: "ok",
};

const VOUCHING: VouchingChain = {
  structure: "individual-to-individual",
  weakest_link_narrative: "neighbor chain",
};

function baseBranch(
  patch: Partial<PartialBriefState> = {},
  signalSlot: Partial<NonNullable<PartialBriefState["signals"]>> = {},
): PartialBriefState {
  return {
    caseId: "case-1",
    runId: "run-1",
    classify: CLASSIFY,
    signals: signalSlot,
    ...patch,
  };
}

describe("mergeParallelSignals", () => {
  it("combines photo / story / vouching slots from each branch", () => {
    const merged = mergeParallelSignals({
      photoSignal: baseBranch({}, { photo: PHOTO }),
      storyCoherence: baseBranch({}, { story: STORY }),
      classifyVouchingChain: baseBranch({}, { vouching: VOUCHING }),
    });
    expect(merged.signals?.photo).toEqual(PHOTO);
    expect(merged.signals?.story).toEqual(STORY);
    expect(merged.signals?.vouching).toEqual(VOUCHING);
  });

  it("preserves classify + caseId/runId from the canonical base branch", () => {
    const merged = mergeParallelSignals({
      photoSignal: baseBranch({}, { photo: PHOTO }),
      storyCoherence: baseBranch({}, { story: STORY }),
      classifyVouchingChain: baseBranch({}, { vouching: VOUCHING }),
    });
    expect(merged.caseId).toBe("case-1");
    expect(merged.runId).toBe("run-1");
    expect(merged.classify).toEqual(CLASSIFY);
  });

  it("throws when storyCoherence branch diverges on runId", () => {
    expect(() =>
      mergeParallelSignals({
        photoSignal: baseBranch({}, { photo: PHOTO }),
        storyCoherence: baseBranch({ runId: "different-run" }, { story: STORY }),
        classifyVouchingChain: baseBranch({}, { vouching: VOUCHING }),
      }),
    ).toThrow(/storyCoherence branch diverged on caseId\/runId/);
  });

  it("throws when classifyVouchingChain branch diverges on classify", () => {
    expect(() =>
      mergeParallelSignals({
        photoSignal: baseBranch({}, { photo: PHOTO }),
        storyCoherence: baseBranch({}, { story: STORY }),
        classifyVouchingChain: baseBranch(
          {
            classify: { ...CLASSIFY, geography_tier: "SAFE" },
          },
          { vouching: VOUCHING },
        ),
      }),
    ).toThrow(/classifyVouchingChain branch diverged on classify/);
  });

  it("supports missing optional signal slots (a branch may legitimately not write its slot)", () => {
    const merged = mergeParallelSignals({
      photoSignal: baseBranch({}, { photo: PHOTO }),
      storyCoherence: baseBranch({}, {}),
      classifyVouchingChain: baseBranch({}, { vouching: VOUCHING }),
    });
    expect(merged.signals?.photo).toEqual(PHOTO);
    expect(merged.signals?.story).toBeUndefined();
    expect(merged.signals?.vouching).toEqual(VOUCHING);
  });

  /*
   * The `extractions` and `policy_matches` slots are populated upstream
   * of the parallel block and every branch must inherit them unchanged.
   * If a future signal step ever mutated those slots inside its branch,
   * the merge would silently pick the photoSignal version and drop the
   * mutation — exactly the bug class Review 3 caught for `classify`.
   */
  it("throws when storyCoherence branch diverges on extractions", () => {
    const baseExtractions = { extractCreatorIdDoc: undefined };
    expect(() =>
      mergeParallelSignals({
        photoSignal: baseBranch({ extractions: baseExtractions }, { photo: PHOTO }),
        storyCoherence: baseBranch(
          {
            extractions: {
              extractCreatorIdDoc: {
                document_type: "passport",
                full_name: "different",
                document_number_redacted: "****",
                issuing_country_iso: "US",
                issue_date_iso: "2020-01-01",
                expiry_date_iso: "2030-01-01",
                matches_organizer_name: true,
                confidence: 90,
              },
            },
          },
          { story: STORY },
        ),
        classifyVouchingChain: baseBranch({ extractions: baseExtractions }, { vouching: VOUCHING }),
      }),
    ).toThrow(/storyCoherence branch diverged on extractions/);
  });

  it("throws when classifyVouchingChain branch diverges on policy_matches", () => {
    const basePolicyMatches: never[] = [];
    expect(() =>
      mergeParallelSignals({
        photoSignal: baseBranch({ policy_matches: basePolicyMatches }, { photo: PHOTO }),
        storyCoherence: baseBranch({ policy_matches: basePolicyMatches }, { story: STORY }),
        classifyVouchingChain: baseBranch(
          {
            policy_matches: [
              {
                clauseId: "zakat.5.1",
                source: "zakat",
                excerpt: "Mutated mid-flight by a hypothetical branch step.",
                relevance: 0.9,
              },
            ],
          },
          { vouching: VOUCHING },
        ),
      }),
    ).toThrow(/classifyVouchingChain branch diverged on policy_matches/);
  });
});
