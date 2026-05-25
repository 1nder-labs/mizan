/**
 * Integration: case-detail container × BriefStream — routing decision
 * AND the RUNNING → stream-errored → empty → re-generate lifecycle
 * across component boundaries.
 *
 * BriefStream is replaced with a controllable test double whose
 * `onStreamError` is wired through a captured ref. That lets a test
 * fire the error from outside while the parent owns the phaseReducer,
 * exercising the actual flow a production SSE failure would trigger.
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { CaseRow } from "@mizan/shared";

const { briefStreamSpy } = vi.hoisted(() => ({
  briefStreamSpy: { onStreamError: undefined as (() => void) | undefined },
}));

vi.mock("@/components/brief/stream.tsx", () => ({
  BriefStream: ({ caseId, onStreamError }: { caseId: string; onStreamError?: () => void }) => {
    briefStreamSpy.onStreamError = onStreamError;
    return <div data-testid="brief-stream-mounted">stream:{caseId}</div>;
  },
}));

vi.mock("@/components/brief/use-workflow-events.ts", () => ({
  useWorkflowEvents: () => ({ events: [], connected: false }),
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
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(<CaseDetail caseRow={baseCase} brief={null} />);
    const mounted = await screen.findByTestId("brief-stream-mounted");
    expect(mounted).toHaveTextContent(`stream:${baseCase.id}`);
  });

  test("DRAFT does NOT mount <BriefStream>", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(<CaseDetail caseRow={{ ...baseCase, status: "DRAFT" }} brief={null} />);
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();
    expect(await screen.findByText(/no brief yet/i)).toBeInTheDocument();
  });

  test("RUNNING + stream error → empty state with Generate CTA reachable + re-mounts stream", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(<CaseDetail caseRow={baseCase} brief={null} />);
    expect(await screen.findByTestId("brief-stream-mounted")).toBeInTheDocument();

    expect(briefStreamSpy.onStreamError).toBeDefined();
    briefStreamSpy.onStreamError?.();

    const generate = await screen.findByRole("button", { name: /generate brief/i });
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();

    await userEvent.setup().click(generate);
    expect(await screen.findByTestId("brief-stream-mounted")).toBeInTheDocument();
  });
});
