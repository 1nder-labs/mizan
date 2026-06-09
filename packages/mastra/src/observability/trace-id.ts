/**
 * Deterministic session-id derivation for HITL trace linkage.
 *
 * A brief run and its reviewer-action carry the same `sessionId` so they
 * are linkable in the Langfuse UI. The `runId` is already a stable, unique
 * identifier shared across both, so the derivation returns it unchanged —
 * identity is the deliberate design, not a placeholder. The reviewer-action
 * resume is an inline D1 chain (not a Mastra `run.resume`), so there is no
 * second trace to reconcile and a hash would buy nothing.
 *
 * The brief trace alone carries the derived `sessionId`; the action is
 * linkable by querying that `sessionId` in Langfuse. Routing through this
 * function (rather than inlining `runId`) keeps the linkage contract in one
 * named, testable place.
 */

/** Returns the stable Langfuse `sessionId` for a workflow `runId`. */
export function deriveSessionId(runId: string): string {
  return runId;
}
