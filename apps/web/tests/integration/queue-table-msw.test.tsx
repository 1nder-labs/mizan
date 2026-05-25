/**
 * Integration: queue table renders rows fetched via MSW-mocked
 * `GET /api/cases`. Asserts column shape (id prefix + recommendation +
 * verification path) populated from the latest_brief denorm.
 *
 * Harness: a minimal RouterProvider primed via `await router.load()`
 * before mounting. Without that prime call RouterProvider hydrates
 * async and the assertion runs against an empty body. See
 * `case-detail.test.tsx` for the same harness comment.
 */
import { describe, expect, test, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { QueueResponse } from "@mizan/shared";
import { startServer } from "../setup/msw-server.ts";
import { QueueTable } from "../../src/components/queue/table.tsx";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

const FIXTURE: QueueResponse = {
  cases: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      status: "READY_FOR_REVIEW",
      category: "humanitarian",
      geography: "PS",
      claimed_zakat_category: null,
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_500_000,
      latest_brief: { recommendation: "READY_FOR_REVIEW", verification_path: "DOCUMENTARY" },
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      status: "DRAFT",
      category: "education",
      geography: "ID",
      claimed_zakat_category: "fakir",
      created_at: 1_700_000_100_000,
      updated_at: 1_700_000_600_000,
      latest_brief: null,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 2,
};

const server = startServer([
  http.get("/api/cases", () => HttpResponse.json(FIXTURE)),
]);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function renderWithRouter(element: React.ReactNode): Promise<void> {
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

describe("<QueueTable /> integration", () => {
  test("renders rows + recommendation badge from latest_brief", async () => {
    await renderWithRouter(
      <QueueTable
        rows={FIXTURE.cases}
        search={{ page: 1, sort: "updated_desc" }}
        onSearchChange={() => {}}
      />,
    );
    expect(await screen.findByText("11111111")).toBeInTheDocument();
    expect(screen.getByText("22222222")).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/documentary/i)).toBeInTheDocument();
    const emDashes = screen.getAllByText("—");
    expect(emDashes.length).toBeGreaterThanOrEqual(2);
  });
});
