import { describe, expect, it } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";
import {
  CHAT_CONTEXT_KEYS,
  buildCopilotInstructions,
} from "../../src/agents/reviewer-copilot/page-context.ts";
import { SYSTEM_PROMPT } from "../../src/agents/reviewer-copilot/system-prompt.ts";

const CASE_ID = "c34d453d-c541-4807-b6f0-b057100cc38d";

describe("buildCopilotInstructions", () => {
  it("returns the base prompt unchanged when no request context is present", () => {
    expect(buildCopilotInstructions(undefined)).toBe(SYSTEM_PROMPT);
  });

  it("returns the base prompt unchanged on a non-case page (no caseId)", () => {
    const rc = new RequestContext();
    rc.set(CHAT_CONTEXT_KEYS.route, "/queue");
    expect(buildCopilotInstructions(rc)).toBe(SYSTEM_PROMPT);
  });

  it("injects the open case id so the model can resolve 'this case'", () => {
    const rc = new RequestContext();
    rc.set(CHAT_CONTEXT_KEYS.route, "/case/$caseId");
    rc.set(CHAT_CONTEXT_KEYS.caseId, CASE_ID);
    const instructions = buildCopilotInstructions(rc);
    expect(instructions.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(instructions).toContain(CASE_ID);
    expect(instructions).toContain("CURRENT CONTEXT");
  });

  it("tells the model not to call get_brief on an un-briefed DRAFT case", () => {
    const rc = new RequestContext();
    rc.set(CHAT_CONTEXT_KEYS.caseId, CASE_ID);
    expect(buildCopilotInstructions(rc)).toContain("DRAFT");
  });
});
