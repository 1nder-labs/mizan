import { describe, expect, it } from "bun:test";
import type { Db } from "@mizan/db";
import { buildReviewerCopilotTools } from "../../src/agents/reviewer-copilot/tools/index.ts";
import type { CopilotHandlerDeps } from "../../src/agents/reviewer-copilot/tools/deps.ts";

const deps: CopilotHandlerDeps = {
  parseRuntime: () => ({
    viewer: { userId: "u", role: "reviewer", organizationId: "o" },
    db: {} as Db,
  }),
  listCasesForViewer: async () => ({ cases: [], page: 1, pageSize: 50, total: 0 }),
  fetchCaseDetail: async () => null,
  loadBrief: async () => {
    throw new Error("unused");
  },
  listSignalsForCase: async () => [],
  getPolicyClause: () => {
    throw new Error("unused");
  },
  searchPolicy: async () => [],
  listAuditPage: async () => ({ entries: [], total: 0 }),
  NotFoundError: class extends Error {},
};

describe("reviewer copilot tool gating", () => {
  it("withholds admin-only list_audit from reviewers", () => {
    const tools = buildReviewerCopilotTools(deps, "reviewer");
    expect("list_audit" in tools).toBe(false);
    expect("list_cases" in tools).toBe(true);
    expect("get_case" in tools).toBe(true);
    expect("search_policy" in tools).toBe(true);
  });

  it("grants the full tool set including list_audit to admins", () => {
    const tools = buildReviewerCopilotTools(deps, "admin");
    expect("list_audit" in tools).toBe(true);
    expect("list_cases" in tools).toBe(true);
    expect("search_policy" in tools).toBe(true);
  });

  it("no longer exposes the removed team tool to any role", () => {
    expect("list_team" in buildReviewerCopilotTools(deps, "admin")).toBe(false);
    expect("list_team" in buildReviewerCopilotTools(deps, "reviewer")).toBe(false);
  });

  it("withholds the queue-navigation tool when a case is open, keeping case + policy tools", () => {
    const tools = buildReviewerCopilotTools(deps, "reviewer", { caseOpen: true });
    expect("list_cases" in tools).toBe(false);
    expect("get_case" in tools).toBe(true);
    expect("get_brief" in tools).toBe(true);
    expect("list_signals" in tools).toBe(true);
    expect("search_policy" in tools).toBe(true);
  });
});
