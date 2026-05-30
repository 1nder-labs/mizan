/**
 * Pure folding helpers for the workflow part stream. The component
 * runs `foldParts(parts)` on every useChat render and consumes the
 * derived `{ text, tools, steps }` tuple.
 *
 * Wire shape — emitted by `@mastra/ai-sdk` `toAISdkStream(stream,
 * { from: "workflow" })`. Two part types carry step progress:
 *   - `data-workflow-step`: a single step update —
 *     `data: { stepId, step: { status } }`.
 *   - `data-workflow`: a full run snapshot —
 *     `data: { steps: { [stepId]: { status } } }`.
 * `status` is one of `running | success | suspended | failed`. Both are
 * folded into the same `stepId → StepEntry` map; terminal states stick so
 * a later snapshot cannot regress a finished step.
 */
import type { StepEntry, StepState, ToolPart, ToolState } from "./stream-types.ts";

/** Human labels for the brief workflow's steps, keyed by Mastra step id. */
const STEP_LABELS: Readonly<Record<string, string>> = {
  classifyCampaign: "Classifying campaign",
  extractCreatorIdDoc: "Reading creator ID",
  extractBankStatement: "Reading bank statement",
  extractCategoryDocs: "Reading category documents",
  extractStoryClaims: "Extracting story claims",
  photoSignal: "Checking photo originality",
  storyCoherence: "Scoring story coherence",
  classifyVouchingChain: "Analysing vouching chain",
  matchPolicy: "Matching policy clauses",
  mergeSignals: "Merging trust signals",
  computeVerificationPath: "Computing verification path",
  forcedEscalateGate: "Escalation gate",
  composeBrief: "Composing the brief",
  draftOrganizerMessage: "Drafting organizer message",
  awaitReviewerAction: "Awaiting reviewer action",
};

function stepLabel(stepId: string): string {
  return STEP_LABELS[stepId] ?? stepId;
}

export interface FoldedStream {
  readonly text: string;
  readonly tools: readonly ToolPart[];
  readonly steps: readonly StepEntry[];
  readonly errorText: string | null;
}

type LooseRecord = Record<string, unknown>;

function isLooseRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): LooseRecord | null {
  return isLooseRecord(value) ? value : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isToolState(value: unknown): value is ToolState {
  return (
    value === "input-streaming" ||
    value === "input-available" ||
    value === "output-available" ||
    value === "output-error"
  );
}

interface PartLike {
  readonly type: string;
  readonly text?: string | undefined;
  readonly state?: string | undefined;
  readonly input?: unknown | undefined;
  readonly output?: unknown | undefined;
  readonly toolCallId?: string | undefined;
  readonly errorText?: string | undefined;
  readonly data?: unknown | undefined;
}

function partLike(value: unknown): PartLike | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.type !== "string") return null;
  return {
    type: record.type,
    text: asString(record.text),
    state: asString(record.state),
    input: record.input,
    output: record.output,
    toolCallId: asString(record.toolCallId),
    errorText: asString(record.errorText),
    data: record.data,
  };
}

function applyToolPart(map: Map<string, ToolPart>, part: PartLike): void {
  const name = part.type.slice(5);
  const id = part.toolCallId ?? name;
  const state: ToolState = isToolState(part.state) ? part.state : "input-streaming";
  const previous = map.get(id);
  map.set(id, {
    id,
    name,
    state,
    input: part.input ?? previous?.input,
    output: part.output ?? previous?.output,
    errorText: part.errorText ?? previous?.errorText,
  });
}

/** Maps a Mastra step `status` to a UI `StepState`. Terminal states stick. */
function statusToState(status: string | undefined, previous: StepState): StepState {
  if (previous === "done" || previous === "failed") return previous;
  if (status === "success") return "done";
  if (status === "failed") return "failed";
  if (status === "running" || status === "suspended") return "running";
  return previous;
}

function upsertStep(map: Map<string, StepEntry>, stepId: string, status: string | undefined): void {
  const previous = map.get(stepId);
  map.set(stepId, {
    id: stepId,
    label: stepLabel(stepId),
    state: statusToState(status, previous?.state ?? "pending"),
  });
}

/** `data-workflow-step`: a single step's status update. */
function applyWorkflowStepPart(map: Map<string, StepEntry>, part: PartLike): void {
  const data = asRecord(part.data) ?? {};
  const stepId = asString(data.stepId);
  const step = asRecord(data.step);
  if (!stepId || !step) return;
  upsertStep(map, stepId, asString(step.status));
}

/** `data-workflow`: a full run snapshot whose `steps` map carries every step. */
function applyWorkflowSnapshotPart(map: Map<string, StepEntry>, part: PartLike): void {
  const data = asRecord(part.data) ?? {};
  const steps = asRecord(data.steps);
  if (!steps) return;
  for (const [stepId, raw] of Object.entries(steps)) {
    const step = asRecord(raw);
    if (step) upsertStep(map, stepId, asString(step.status));
  }
}

export function foldParts(parts: readonly unknown[]): FoldedStream {
  let text = "";
  const tools = new Map<string, ToolPart>();
  const steps = new Map<string, StepEntry>();
  let errorText: string | null = null;

  for (const raw of parts) {
    const part = partLike(raw);
    if (!part) continue;
    if (part.type === "text" && part.text) {
      text += part.text;
      continue;
    }
    if (part.type === "error" && part.errorText) {
      errorText = part.errorText;
      continue;
    }
    if (part.type.startsWith("tool-")) {
      applyToolPart(tools, part);
      continue;
    }
    if (part.type === "data-workflow-step") {
      applyWorkflowStepPart(steps, part);
      continue;
    }
    if (part.type === "data-workflow") {
      applyWorkflowSnapshotPart(steps, part);
    }
  }

  return {
    text,
    tools: Array.from(tools.values()),
    steps: Array.from(steps.values()),
    errorText,
  };
}
