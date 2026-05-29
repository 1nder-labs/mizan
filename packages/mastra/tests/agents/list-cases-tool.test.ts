import { describe, expect, it } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";
import type { Db } from "@mizan/db";
import { createListCasesTool } from "../../src/agents/reviewer-copilot/tools/list-cases.ts";
import type { CopilotHandlerDeps } from "../../src/agents/reviewer-copilot/tools/deps.ts";

const VIEWER = {
  userId: "user-1",
  role: "reviewer" as const,
  organizationId: "org-1",
};

const stubDb = {} as Db;

function buildDeps(
  listCasesForViewer: CopilotHandlerDeps["listCasesForViewer"],
): CopilotHandlerDeps {
  return {
    parseRuntime: (requestContext) => {
      if (!requestContext) throw new Error("missing context");
      return { viewer: VIEWER, db: stubDb };
    },
    listCasesForViewer,
    fetchCaseDetail: async () => null,
    loadBrief: async () => {
      throw new Error("not used");
    },
    listSignalsForCase: async () => [],
    getPolicyClause: () => {
      throw new Error("not used");
    },
    listTeamMembers: async () => [],
    listAuditPage: async () => ({ entries: [], total: 0 }),
    NotFoundError: class NotFoundError extends Error {},
  };
}

describe("list_cases copilot tool", () => {
  it("invokes listCasesForViewer with viewer from runtimeContext", async () => {
    let capturedViewer: typeof VIEWER | null = null;
    const deps = buildDeps(async (_input, viewer) => {
      capturedViewer = viewer;
      return { cases: [{ id: "case-1" }], page: 1, pageSize: 50, total: 1 };
    });
    const tool = createListCasesTool(deps);
    const requestContext = new RequestContext();
    requestContext.set("viewer", VIEWER);
    requestContext.set("db", stubDb);
    const result = await tool.execute?.({ assignee: "me" }, { requestContext });
    expect(capturedViewer).toEqual(VIEWER);
    expect(result).toEqual({ cases: [{ id: "case-1" }], truncated: false });
  });

  it("marks truncated when total exceeds page rows", async () => {
    const deps = buildDeps(async () => ({
      cases: Array.from({ length: 50 }, (_, index) => ({ id: `case-${index}` })),
      page: 1,
      pageSize: 50,
      total: 120,
    }));
    const tool = createListCasesTool(deps);
    const requestContext = new RequestContext();
    requestContext.set("viewer", VIEWER);
    requestContext.set("db", stubDb);
    const result = await tool.execute?.({}, { requestContext });
    expect(result?.truncated).toBe(true);
  });
});
