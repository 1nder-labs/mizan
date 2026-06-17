/**
 * Integration: case-detail container routes by status across non-stream
 * modes — DRAFT empty card, FAILED destructive alert, ACTIONED
 * persisted summary, and the degraded-brief retry affordance. RUNNING
 * mount + stream lifecycle integration lives in
 * `case-detail-stream.test.tsx` (BriefStream is mocked there to keep
 * this file focused on the non-streaming branches).
 *
 * Harness: minimal RouterProvider + memory history primed via
 * `await router.load()` before mount so the first paint isn't the
 * router's empty loading shim.
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { CaseDetailResponse, CaseRow } from "@mizan/shared";

vi.mock("@/components/brief/use-workflow-tape-invalidation.ts", () => ({
  useWorkflowTapeInvalidation: () => undefined,
}));

import { CaseDetail } from "../../src/components/case/detail.tsx";

const baseCase: CaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "DRAFT",
  title: "Test campaign",
  category: "humanitarian",
  geography: "PS",
  claimed_zakat_category: null,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_500_000,
  latest_brief: null,
  assigned_to: null,
  client_submitted: false,
  latest_action: null,
  client_responded: false,
  disposition: "SUBMITTED",
};

const briefFixture: NonNullable<CaseDetailResponse["brief"]> = {
  recommendation: "READY_FOR_REVIEW",
  confidence: 88,
  composed_at: 1_700_000_600_000,
  payload_json: {
    recommendation: "READY_FOR_REVIEW",
    verification_path: "documentary",
    geography_tier: "SAFE",
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: "Verified humanitarian campaign with documentary evidence.",
    confidence: 88,
    policy_citations: [],
  },
};

async function renderDetail(element: React.ReactNode): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <>{element}</> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("<CaseDetail /> integration", () => {
  test("DRAFT renders the not-yet-generated empty state", async () => {
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "DRAFT" }}
        brief={null}
        overlay={null}
        archived={false}
      />,
    );
    expect(await screen.findByText(/no brief yet/i)).toBeInTheDocument();
  });

  test("FAILED renders the destructive alert", async () => {
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "FAILED" }}
        brief={null}
        overlay={null}
        archived={false}
      />,
    );
    expect(await screen.findByText(/generation failed/i)).toBeInTheDocument();
  });

  test("SUSPENDED_HITL with brief renders persisted summary", async () => {
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "SUSPENDED_HITL" }}
        brief={briefFixture}
        overlay={null}
        archived={false}
      />,
    );
    expect(await screen.findByText("Recommendation")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText(/Verified humanitarian/i)).toBeInTheDocument();
  });

  test("ACTIONED + degraded null brief shows a terminal message, NOT a re-generate button", async () => {
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "ACTIONED" }}
        brief={null}
        overlay={null}
        archived={false}
      />,
    );
    expect(await screen.findByText(/no brief on file/i)).toBeInTheDocument();
    /**
     * ACTIONED is terminal — the producer guard 409s a re-brief POST, so the
     * Generate affordance is intentionally absent. Showing it created a silent
     * 409-loop (#1). The degraded-null-brief copy directs to an admin instead.
     */
    expect(screen.queryByRole("button", { name: /generate brief/i })).toBeNull();
    expect(screen.getByText(/contact an admin/i)).toBeInTheDocument();
  });

  test("SUSPENDED_HITL renders the action panel instead of stream or empty", async () => {
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "SUSPENDED_HITL" }}
        brief={briefFixture}
        overlay={null}
        archived={false}
      />,
    );
    expect(await screen.findByRole("button", { name: /^submit$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();
  });
});
