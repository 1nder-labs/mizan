/**
 * Pure folding helpers for the workflow part stream. The component
 * runs `foldParts(parts)` on every useChat render and consumes the
 * derived `{ text, tools, steps }` tuple.
 *
 * Wire shape — pinned. `data-workflow` parts carry `{ event, step,
 * label?, durationMs?, note? }`. Earlier prototypes accepted
 * `stepId` / `kind` aliases; those were removed once the worker
 * stabilised on `event` + `step`. If you find yourself adding an
 * alias here, change the worker emitter instead.
 */
import type { StepEntry, StepState, ToolPart, ToolState } from "./stream-types.ts";

export interface BriefStreamView {
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

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
  readonly text?: string;
  readonly state?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly toolCallId?: string;
  readonly errorText?: string;
  readonly data?: unknown;
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

function nextStepState(event: string, previous: StepState): StepState {
  if (event === "step.start") return "running";
  if (event === "step.finish") return "done";
  if (event === "step.fail") return "failed";
  return previous;
}

function applyDataPart(map: Map<string, StepEntry>, part: PartLike): void {
  if (part.type !== "data-workflow") return;
  const data = asRecord(part.data) ?? {};
  const stepId = asString(data.step);
  const event = asString(data.event);
  if (!stepId || !event) return;
  const previous = map.get(stepId);
  map.set(stepId, {
    id: stepId,
    label: asString(data.label) ?? previous?.label ?? stepId,
    state: nextStepState(event, previous?.state ?? "pending"),
    durationMs: asNumber(data.durationMs) ?? previous?.durationMs,
    note: asString(data.note) ?? previous?.note,
  });
}

export function foldParts(parts: readonly unknown[]): BriefStreamView {
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
    if (part.type === "data-workflow") {
      applyDataPart(steps, part);
    }
  }

  return {
    text,
    tools: Array.from(tools.values()),
    steps: Array.from(steps.values()),
    errorText,
  };
}
