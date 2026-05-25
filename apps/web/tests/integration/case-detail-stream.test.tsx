/**
 * Integration: case-detail RUNNING status mounts <BriefStream>.
 *
 * BriefStream is mocked at the module boundary because the AI SDK 6
 * useChat + DefaultChatTransport stack opens an EventSource against
 * `/api/cases/:id/brief` which jsdom + MSW cannot reliably script
 * across releases. The contract this test pins is the routing
 * decision: "status === RUNNING → mount the stream consumer."
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
import type { CaseRow } from "@mizan/shared";

vi.mock("@/components/brief/stream.tsx", () => ({
  BriefStream: ({ caseId }: { caseId: string }) => (
    <div data-testid="brief-stream-mounted">stream:{caseId}</div>
  ),
}));

import { CaseDetail } from "../../src/components/case/detail.tsx";

const baseCase: CaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "RUNNING",
  category: "humanitarian",
  geography: "PS",
  claimed_zakat_category: null,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_500_000,
  latest_brief: null,
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

describe("<CaseDetail /> stream routing", () => {
  test("RUNNING status mounts <BriefStream>", async () => {
    await renderDetail(<CaseDetail caseRow={baseCase} brief={null} />);
    const mounted = await screen.findByTestId("brief-stream-mounted");
    expect(mounted).toHaveTextContent(`stream:${baseCase.id}`);
  });

  test("DRAFT does NOT mount <BriefStream>", async () => {
    await renderDetail(<CaseDetail caseRow={{ ...baseCase, status: "DRAFT" }} brief={null} />);
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();
    expect(await screen.findByText(/no brief yet/i)).toBeInTheDocument();
  });
});
