/**
 * Integration: admin audit list via MSW-mocked GET /api/admin/audit.
 */
import { describe, expect, test, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { AuditListResponse } from "@mizan/shared";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { startServer } from "../setup/msw-server.ts";
import { AuditList } from "../../src/components/admin/audit-list.tsx";

const FIXTURE: AuditListResponse = {
  entries: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      case_id: "11111111-1111-4111-8111-111111111111",
      case_status: "ACTIONED",
      case_category: "humanitarian",
      reviewer_email: "reviewer@test.local",
      action: "APPROVE",
      rationale: "Looks good",
      acted_at: 1_700_000_700_000,
    },
  ],
  page: 1,
  page_size: 25,
  total: 1,
};

const server = startServer([
  http.get("/api/admin/audit", ({ request }) => {
    const url = new URL(request.url);
    const page = url.searchParams.get("page") ?? "1";
    return HttpResponse.json({ ...FIXTURE, page: Number(page) });
  }),
]);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function renderAuditList(initialEntries = ["/admin/audit?page=1"]): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const auditRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/audit",
    validateSearch: (search) => ({
      page: Number(search.page ?? 1),
      page_size: Number(search.page_size ?? 25),
    }),
    component: AuditList,
  });
  const routeTree = rootRoute.addChildren([auditRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("<AuditList /> integration", () => {
  test("renders rows from the mocked audit endpoint", async () => {
    await renderAuditList();
    expect(await screen.findByText("APPROVE")).toBeInTheDocument();
    expect(screen.getByText("reviewer@test.local")).toBeInTheDocument();
  });

  test("shows empty copy when no actions exist", async () => {
    server.use(http.get("/api/admin/audit", () => HttpResponse.json({ ...FIXTURE, entries: [], total: 0 })));
    await renderAuditList();
    expect(await screen.findByText(/no reviewer actions recorded yet/i)).toBeInTheDocument();
  });

  test("pagination next updates page search param and refetches", async () => {
    const requestedPages: string[] = [];
    server.use(
      http.get("/api/admin/audit", ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get("page") ?? "1";
        requestedPages.push(page);
        return HttpResponse.json({ ...FIXTURE, page: Number(page), total: 60 });
      }),
    );

    await renderAuditList();
    const user = userEvent.setup();
    await screen.findByText("APPROVE");
    await user.click(screen.getByRole("button", { name: /next/i }));

    await screen.findByText(/page 2/i);
    expect(requestedPages).toContain("2");
  });
});
