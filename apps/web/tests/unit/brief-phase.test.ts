import { describe, expect, it } from "bun:test";
import type { BriefPayload } from "@mizan/shared";
import {
  INITIAL_PHASE,
  deriveMode,
  phaseReducer,
  type BriefSummary,
} from "../../src/components/case/brief-phase.ts";

const PAYLOAD = {
  recommendation: "REQUEST_DOCS",
  verification_path: "documentary",
  geography_tier: "SAFE",
  policy_grounded: true,
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: "claims",
  confidence: 80,
  policy_citations: [],
} satisfies BriefPayload;

const BRIEF: BriefSummary = {
  recommendation: "REQUEST_DOCS",
  confidence: 80,
  composed_at: 1,
  payload_json: PAYLOAD,
};

describe("phaseReducer", () => {
  it("user-generated sets userTriggered", () => {
    expect(phaseReducer(INITIAL_PHASE, { type: "user-generated" })).toEqual({
      userTriggered: true,
      streamErrored: false,
    });
  });

  it("case-changed resets to INITIAL", () => {
    const dirty = { userTriggered: true, streamErrored: true };
    expect(phaseReducer(dirty, { type: "case-changed" })).toEqual(INITIAL_PHASE);
  });

  it("status-changed to RUNNING preserves an active trigger", () => {
    const triggered = { userTriggered: true, streamErrored: false };
    expect(phaseReducer(triggered, { type: "status-changed", status: "RUNNING" })).toBe(triggered);
  });

  it("status-changed to SUSPENDED_HITL resets the trigger (no post-action leak)", () => {
    const triggered = { userTriggered: true, streamErrored: false };
    expect(phaseReducer(triggered, { type: "status-changed", status: "SUSPENDED_HITL" })).toEqual(
      INITIAL_PHASE,
    );
  });

  it("status-changed to ACTIONED resets the trigger", () => {
    const triggered = { userTriggered: true, streamErrored: false };
    expect(phaseReducer(triggered, { type: "status-changed", status: "ACTIONED" })).toEqual(
      INITIAL_PHASE,
    );
  });
});

describe("spurious re-run regression — Generate → suspend → action", () => {
  it("a stale trigger from Generate would mount a stream on ACTIONED (the bug)", () => {
    const leaked = { userTriggered: true, streamErrored: false };
    expect(deriveMode("ACTIONED", BRIEF, leaked)).toEqual({ mode: "stream", autoStart: true });
  });

  it("the SUSPENDED_HITL reset clears the trigger so ACTIONED renders summary, not stream", () => {
    let phase = INITIAL_PHASE;
    phase = phaseReducer(phase, { type: "user-generated" });
    phase = phaseReducer(phase, { type: "status-changed", status: "RUNNING" });
    phase = phaseReducer(phase, { type: "status-changed", status: "SUSPENDED_HITL" });
    expect(phase.userTriggered).toBe(false);
    expect(deriveMode("ACTIONED", BRIEF, phase)).toEqual({ mode: "summary", autoStart: false });
  });
});

describe("deriveMode", () => {
  it("SUSPENDED_HITL is always action (even with a stale trigger)", () => {
    expect(
      deriveMode("SUSPENDED_HITL", BRIEF, { userTriggered: true, streamErrored: false }),
    ).toEqual({ mode: "action", autoStart: false });
  });

  it("an explicit trigger streams with autoStart:true while RUNNING", () => {
    expect(deriveMode("RUNNING", null, { userTriggered: true, streamErrored: false })).toEqual({
      mode: "stream",
      autoStart: true,
    });
  });

  it("a stream error on RUNNING falls back to resume-only stream (autoStart:false)", () => {
    expect(deriveMode("RUNNING", null, { userTriggered: true, streamErrored: true })).toEqual({
      mode: "stream",
      autoStart: false,
    });
  });

  it("RUNNING with no trigger reconnects via resume-GET (autoStart:false)", () => {
    expect(deriveMode("RUNNING", null, INITIAL_PHASE)).toEqual({
      mode: "stream",
      autoStart: false,
    });
  });

  it("QUEUED with no trigger reconnects via resume-GET (autoStart:false)", () => {
    expect(deriveMode("QUEUED", null, INITIAL_PHASE)).toEqual({
      mode: "stream",
      autoStart: false,
    });
  });

  it("ACTIONED with a brief and no trigger is summary", () => {
    expect(deriveMode("ACTIONED", BRIEF, INITIAL_PHASE)).toEqual({
      mode: "summary",
      autoStart: false,
    });
  });

  it("DRAFT with no brief and no trigger is empty", () => {
    expect(deriveMode("DRAFT", null, INITIAL_PHASE)).toEqual({
      mode: "empty",
      autoStart: false,
    });
  });
});
