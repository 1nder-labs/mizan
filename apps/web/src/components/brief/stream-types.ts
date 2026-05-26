/**
 * Shared types for the brief-stream pipeline. Lives at this leaf so
 * `stream-parts.ts` (pure fold) doesn't have to import from the UI
 * leaves it renders — keeping the dependency graph one-way.
 */

export type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

export interface ToolPart {
  readonly id: string;
  readonly name: string;
  readonly state: ToolState;
  readonly input?: unknown | undefined;
  readonly output?: unknown | undefined;
  readonly errorText?: string | undefined;
}

export type StepState = "pending" | "running" | "done" | "failed";

export interface StepEntry {
  readonly id: string;
  readonly label: string;
  readonly state: StepState;
  readonly durationMs?: number | undefined;
  readonly note?: string | undefined;
}
