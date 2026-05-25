/**
 * Integration: case-detail container routes by status. RUNNING mounts
 * <BriefStream>; READY_FOR_REVIEW with brief renders persisted summary;
 * DRAFT renders the not-yet-generated empty card.
 *
 * Harness: a minimal RouterProvider with a memory history + a synchronous
 * `await router.load()` BEFORE mounting. Without `router.load()` the
 * RouterProvider mounts asynchronously and the first paint is empty —
 * which is exactly what bit the prior version of these tests (failed
 * assertions against an empty <body>). The TanStack Router docs (v1)
 * call this out: "When using RouterProvider in tests, await
 * router.load() to prime the route match tree before render." Helper
 * stays here (instead of `tests/setup/`) because the matcher shape is
 * test-file local; sharing it would couple unrelated tests.
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
    await renderDetail(<CaseDetail caseRow={{ ...baseCase, status: "DRAFT" }} brief={null} />);
    expect(await screen.findByText(/no brief yet/i)).toBeInTheDocument();
  });

  test("FAILED renders the destructive alert", async () => {
    await renderDetail(<CaseDetail caseRow={{ ...baseCase, status: "FAILED" }} brief={null} />);
    expect(await screen.findByText(/generation failed/i)).toBeInTheDocument();
  });

  test("READY_FOR_REVIEW with brief renders persisted summary", async () => {
    await renderDetail(
      <CaseDetail caseRow={{ ...baseCase, status: "READY_FOR_REVIEW" }} brief={briefFixture} />,
    );
    expect(await screen.findByText("Recommendation")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText(/Verified humanitarian/i)).toBeInTheDocument();
  });

  test("READY_FOR_REVIEW + degraded null brief surfaces a re-generate affordance", async () => {
    await renderDetail(
      <CaseDetail caseRow={{ ...baseCase, status: "READY_FOR_REVIEW" }} brief={null} />,
    );
    expect(await screen.findByText(/no brief on file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate brief/i })).toBeInTheDocument();
  });
});
