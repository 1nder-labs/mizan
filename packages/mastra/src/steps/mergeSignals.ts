import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { PartialBriefStateSchema, type PartialBriefState } from "../schemas/partial-brief-state.ts";

/**
 * Re-joins the three signal-emitting parallel branches back into a single
 * `PartialBriefStateSchema`. Mastra `.parallel([...])` produces an object
 * keyed by step id; `mergeSignals` is the canonical "wide branch → narrow
 * state" reducer so every downstream step keeps the standard input shape.
 *
 * Mastra's inferred output type for `.parallel([...])` is the loose
 * `Record<string, unknown>`; the step's input schema is therefore
 * permissive at the type level and tightened at runtime with the strict
 * `ParallelBranchesSchema` parser below.
 */
const PARALLEL_BRANCH_KEYS = ["photoSignal", "storyCoherence", "classifyVouchingChain"] as const;

type ParallelBranchKey = (typeof PARALLEL_BRANCH_KEYS)[number];

const ParallelBranchesSchema = z.object({
  photoSignal: PartialBriefStateSchema,
  storyCoherence: PartialBriefStateSchema,
  classifyVouchingChain: PartialBriefStateSchema,
});

export type ParallelSignalsInput = z.infer<typeof ParallelBranchesSchema>;

/** Validates the loose Mastra parallel output against the strict branch shape. */
function parseParallelBranches(input: unknown): ParallelSignalsInput {
  return ParallelBranchesSchema.parse(input);
}

/**
 * Combines parallel-branch outputs into a single PartialBriefState.
 *
 * Validates that all three branches agree on caseId, runId, and classify
 * before picking the photoSignal branch as the canonical non-signals
 * carrier. Silent divergence would let an upstream parallel step's
 * concurrent mutation (e.g. a hypothetical future step that wrote to
 * `extractions` from inside a parallel branch) drop another branch's
 * state on the floor.
 */
export function mergeParallelSignals(input: ParallelSignalsInput): PartialBriefState {
  const { photoSignal: a, storyCoherence: b, classifyVouchingChain: c } = input;
  assertBranchAgreement(a, b, "storyCoherence");
  assertBranchAgreement(a, c, "classifyVouchingChain");
  const photo = a.signals?.photo;
  const story = b.signals?.story;
  const vouching = c.signals?.vouching;
  return {
    ...a,
    signals: {
      ...a.signals,
      ...(photo ? { photo } : {}),
      ...(story ? { story } : {}),
      ...(vouching ? { vouching } : {}),
    },
  };
}

/**
 * Asserts that a parallel branch's non-signals state matches the canonical
 * `photoSignal` branch.
 *
 * Compares `caseId`, `runId`, `classify`, `extractions`, and
 * `policy_matches` — every slot a branch is supposed to inherit
 * unchanged from upstream. Whole-object equality on `classify` (via
 * `shallowJsonEqual`) is intentional: a field-list comparator would
 * silently drop divergences on any future classify field, exactly the
 * bug class Review 5 caught for the prior 3-field shape.
 */
function assertBranchAgreement(
  base: PartialBriefState,
  other: PartialBriefState,
  branchName: ParallelBranchKey,
): void {
  if (base.caseId !== other.caseId || base.runId !== other.runId) {
    throw new Error(
      `mergeSignals: ${branchName} branch diverged on caseId/runId — expected (${base.caseId}/${base.runId})`,
    );
  }
  if (!shallowJsonEqual(base.classify, other.classify)) {
    throw new Error(`mergeSignals: ${branchName} branch diverged on classify`);
  }
  if (!shallowJsonEqual(base.extractions, other.extractions)) {
    throw new Error(`mergeSignals: ${branchName} branch diverged on extractions`);
  }
  if (!shallowJsonEqual(base.policy_matches, other.policy_matches)) {
    throw new Error(`mergeSignals: ${branchName} branch diverged on policy_matches`);
  }
}

/** Structural equality via JSON serialisation — adequate for workflow-state slots. */
function shallowJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export const mergeSignals = createStep({
  id: "mergeSignals",
  inputSchema: z.unknown(),
  outputSchema: PartialBriefStateSchema,
  execute: async ({ inputData }) => mergeParallelSignals(parseParallelBranches(inputData)),
});
