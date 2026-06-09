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
const PARALLEL_BRANCH_KEYS = [
  "photoSignal",
  "storyCoherence",
  "classifyVouchingChain",
  "ocrMismatch",
] as const;

type ParallelBranchKey = (typeof PARALLEL_BRANCH_KEYS)[number];

const ParallelBranchesSchema = z.object({
  photoSignal: PartialBriefStateSchema,
  storyCoherence: PartialBriefStateSchema,
  classifyVouchingChain: PartialBriefStateSchema,
  ocrMismatch: PartialBriefStateSchema,
});

export type ParallelSignalsInput = z.infer<typeof ParallelBranchesSchema>;

/** Validates the loose Mastra parallel output against the strict branch shape. */
function parseParallelBranches(input: unknown): ParallelSignalsInput {
  return ParallelBranchesSchema.parse(input);
}

/**
 * Combines parallel-branch outputs into a single PartialBriefState.
 *
 * Validates that all three branches agree on caseId, runId, classify,
 * extractions, and policy_matches before picking the photoSignal branch
 * as the canonical non-signals carrier. Silent divergence would let an
 * upstream parallel step's concurrent mutation drop another branch's
 * state on the floor.
 *
 * Also asserts every parallel branch wrote its signal slot —
 * `assertParallelSignalsComplete` mirrors `computeVerificationPath`'s
 * strict-step contract and the brief-workflow integration's trio check.
 * A missing slot means a parallel step degraded silently, and
 * downstream gates (forced escalate, draft) would otherwise consume
 * partial signal state and produce a misleading brief.
 */
export function mergeParallelSignals(input: ParallelSignalsInput): PartialBriefState {
  const { photoSignal: a, storyCoherence: b, classifyVouchingChain: c, ocrMismatch: d } = input;
  assertBranchAgreement(a, b, "storyCoherence");
  assertBranchAgreement(a, c, "classifyVouchingChain");
  assertBranchAgreement(a, d, "ocrMismatch");
  const photo = a.signals?.photo;
  const story = b.signals?.story;
  const vouching = c.signals?.vouching;
  const ocr = d.signals?.ocr;
  assertParallelSignalsComplete(a.caseId, a.runId, { photo, story, vouching, ocr });
  return {
    ...a,
    signals: {
      ...a.signals,
      photo,
      story,
      vouching,
      ocr,
    },
  };
}

type SignalsSlot = NonNullable<PartialBriefState["signals"]>;

/**
 * Throws if any of the three parallel branches did not write its
 * signal slot. Each branch is a `.then`-compatible step whose contract
 * is "populate exactly one slot in `state.signals`"; a missing slot at
 * this seam means that step degraded silently (caught its own error,
 * returned early, or skipped the upsert).
 */
function assertParallelSignalsComplete(
  caseId: string,
  runId: string,
  slots: {
    readonly photo: SignalsSlot["photo"] | undefined;
    readonly story: SignalsSlot["story"] | undefined;
    readonly vouching: SignalsSlot["vouching"] | undefined;
    readonly ocr: SignalsSlot["ocr"] | undefined;
  },
): void {
  const missing: string[] = [];
  if (!slots.photo) missing.push("photo");
  if (!slots.story) missing.push("story");
  if (!slots.vouching) missing.push("vouching");
  if (!slots.ocr) missing.push("ocr");
  if (missing.length > 0) {
    throw new Error(
      `mergeSignals: missing signal slot(s) [${missing.join(", ")}] for case ${caseId} run ${runId} — a parallel signal step degraded silently`,
    );
  }
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
