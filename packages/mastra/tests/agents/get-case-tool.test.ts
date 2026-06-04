import { describe, expect, it } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";
import type { Db } from "@mizan/db";
import { createGetCaseTool } from "../../src/agents/reviewer-copilot/tools/get-case.ts";
import type { CopilotHandlerDeps } from "../../src/agents/reviewer-copilot/tools/deps.ts";

const VIEWER = { userId: "user-1", role: "reviewer" as const, organizationId: "org-1" };
const stubDb = {} as Db;
const CASE_UUID = "11111111-1111-4111-8111-111111111111";

function buildDeps(overrides: Partial<CopilotHandlerDeps>): CopilotHandlerDeps {
  return {
    parseRuntime: (requestContext) => {
      if (!requestContext) throw new Error("missing context");
      return { viewer: VIEWER, db: stubDb };
    },
    listCasesForViewer: async () => ({ cases: [], page: 1, pageSize: 50, total: 0 }),
    fetchCaseDetail: async () => null,
    resolveCaseIdByTitle: async () => ({ status: "none" }),
    loadBrief: async () => {
      throw new Error("not used");
    },
    listSignalsForCase: async () => [],
    getPolicyClause: () => {
      throw new Error("not used");
    },
    searchPolicy: async () => [],
    listTeamMembers: async () => [],
    listAuditPage: async () => ({ entries: [], total: 0 }),
    NotFoundError: class NotFoundError extends Error {},
    ...overrides,
  };
}

function contextWith(): { requestContext: RequestContext } {
  const requestContext = new RequestContext();
  requestContext.set("viewer", VIEWER);
  requestContext.set("db", stubDb);
  return { requestContext };
}

describe("get_case copilot tool", () => {
  it("fetches directly by caseId without resolving a title", async () => {
    let resolveCalled = false;
    let fetchedId: string | undefined;
    const deps = buildDeps({
      resolveCaseIdByTitle: async () => {
        resolveCalled = true;
        return { status: "none" };
      },
      fetchCaseDetail: async (id) => {
        fetchedId = id;
        return null;
      },
    });
    const tool = createGetCaseTool(deps);
    await expect(tool.execute?.({ caseId: CASE_UUID }, contextWith())).rejects.toThrow();
    expect(resolveCalled).toBe(false);
    expect(fetchedId).toBe(CASE_UUID);
  });

  it("resolves an exact title to its id, then fetches that case", async () => {
    let fetchedId: string | undefined;
    const deps = buildDeps({
      resolveCaseIdByTitle: async (title) => {
        expect(title).toBe("Hira Welfare Trust");
        return { status: "found", caseId: CASE_UUID };
      },
      fetchCaseDetail: async (id) => {
        fetchedId = id;
        return null;
      },
    });
    const tool = createGetCaseTool(deps);
    await expect(tool.execute?.({ title: "Hira Welfare Trust" }, contextWith())).rejects.toThrow();
    expect(fetchedId).toBe(CASE_UUID);
  });

  it("throws a disambiguation error when a title matches more than one case", async () => {
    const deps = buildDeps({
      resolveCaseIdByTitle: async () => ({ status: "ambiguous", count: 2 }),
    });
    const tool = createGetCaseTool(deps);
    await expect(
      tool.execute?.({ title: "Family emergency appeal" }, contextWith()),
    ).rejects.toThrow(/more than one case is titled/);
  });

  it("throws not_found naming the title when nothing matches", async () => {
    const deps = buildDeps({ resolveCaseIdByTitle: async () => ({ status: "none" }) });
    const tool = createGetCaseTool(deps);
    await expect(tool.execute?.({ title: "Nonexistent Campaign" }, contextWith())).rejects.toThrow(
      /no case titled "Nonexistent Campaign"/,
    );
  });
});
