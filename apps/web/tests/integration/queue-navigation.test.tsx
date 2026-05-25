/**
 * Integration: queue row click navigates to /case/$caseId.
 *
 * 8-row fixture exercises the full sorted page; click on row #3
 * fires `useNavigate` and we assert the resulting location matches
 * the routed `/case/$caseId` path. Harness builds a real
 * `/case/$caseId` route so the navigation has a target to land on.
 */
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { CaseRow, QueueSearch } from "@mizan/shared";
import { QueueTable } from "../../src/components/queue/table.tsx";

function makeRow(index: number): CaseRow {
  const hex = String(index).padStart(8, "0");
  return {
    id: `${hex}-1111-4111-8111-111111111111`,
    status: "READY_FOR_REVIEW",
    category: "humanitarian",
    geography: "PS",
    claimed_zakat_category: null,
    created_at: 1_700_000_000_000 + index,
    updated_at: 1_700_000_500_000 + index,
    latest_brief: { recommendation: "READY_FOR_REVIEW", verification_path: "documentary" },
  };
}

const ROWS: readonly CaseRow[] = Array.from({ length: 8 }, (_, idx) => makeRow(idx + 1));
const SEARCH: QueueSearch = { page: 1, sort: "updated_desc" };

async function renderTable(): Promise<ReturnType<typeof createRouter>> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const queueRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <QueueTable rows={ROWS} search={SEARCH} onSearchChange={() => {}} />
    ),
  });
  const caseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/case/$caseId",
    component: () => <div data-testid="case-page" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([queueRoute, caseRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("<QueueTable /> navigation", () => {
  test("renders all 8 rows", async () => {
    await renderTable();
    for (const row of ROWS) {
      const shortId = row.id.slice(0, 8);
      expect(await screen.findByText(shortId)).toBeInTheDocument();
    }
  });

  test("clicking row #3 navigates to /case/$caseId for that row", async () => {
    const router = await renderTable();
    const user = userEvent.setup();
    const targetRow = ROWS[2];
    if (!targetRow) throw new Error("fixture row missing");
    const cell = await screen.findByText(targetRow.id.slice(0, 8));
    await user.click(cell);
    expect(router.state.location.pathname).toBe(`/case/${targetRow.id}`);
  });
});
