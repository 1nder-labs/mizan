/**
 * Integration: case-detail container routes by status. RUNNING mounts
 * <BriefStream>; READY_FOR_REVIEW with brief renders persisted summary;
 * DRAFT renders empty state.
 */
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { CaseDetailResponse, CaseRow } from "@mizan/shared";
import { CaseDetail } from "../../src/components/case/detail.tsx";

const baseCase: CaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "DRAFT",
  category: "humanitarian",
  geography: "PS",
  claimed_zakat_category: null,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_500_000,
  latest_brief: null,
};

const briefFixture: NonNullable<CaseDetailResponse["brief"]> = {
  recommendation: "READY_FOR_REVIEW",
  confidence: 88,
  composed_at: 1_700_000_600_000,
  payload_json: {
    recommendation: "READY_FOR_REVIEW",
    verification_path: "DOCUMENTARY",
    geography_tier: 2,
    policy_grounded: true,
    missing_docs: [],
    reviewer_questions: [],
    extracted_claims: "Verified humanitarian campaign with documentary evidence.",
    confidence: 88,
    policy_citations: [],
  },
};

function renderDetail(element: React.ReactNode): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <>{element}</> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("<CaseDetail /> integration", () => {
  test("DRAFT renders the not-yet-generated empty state", () => {
    renderDetail(<CaseDetail caseRow={{ ...baseCase, status: "DRAFT" }} brief={null} />);
    expect(screen.getByText(/not yet generated/i)).toBeInTheDocument();
  });

  test("FAILED renders the destructive alert", () => {
    renderDetail(<CaseDetail caseRow={{ ...baseCase, status: "FAILED" }} brief={null} />);
    expect(screen.getByText(/generation failed/i)).toBeInTheDocument();
  });

  test("READY_FOR_REVIEW with brief renders persisted summary", () => {
    renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "READY_FOR_REVIEW" }}
        brief={briefFixture}
      />,
    );
    expect(screen.getByText("Recommendation")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText(/Verified humanitarian/i)).toBeInTheDocument();
  });
});
