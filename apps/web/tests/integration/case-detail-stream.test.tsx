/**
 * Integration: case-detail container × BriefStream — routing decision
 * AND the lifecycle across component boundaries.
 *
 * Key invariant: RUNNING/QUEUED status alone does NOT auto-mount
 * <BriefStream> (which POSTs `/brief` on every render). Only an
 * explicit user click (Generate) triggers BriefStream. A server-
 * observed in-flight workflow renders the passive `BriefInflight`
 * panel instead. This is the regression guard for the page-load
 * POST-storm bug.
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

vi.mock("@/components/brief/use-workflow-tape-invalidation.ts", () => ({
  useWorkflowTapeInvalidation: () => undefined,
}));

import { CaseDetail } from "../../src/components/case/detail.tsx";

const baseCase: CaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "RUNNING",
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
  test("RUNNING status does NOT auto-mount <BriefStream> (no page-load POST)", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail
        caseRow={baseCase}
        brief={null}
        overlay={null}
        clientResponded={false}
        latestAction={null}
      />,
    );
    expect(await screen.findByText(/workflow running/i)).toBeInTheDocument();
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();
  });

  test("QUEUED status renders inflight panel, no BriefStream", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "QUEUED" }}
        brief={null}
        overlay={null}
        clientResponded={false}
        latestAction={null}
      />,
    );
    expect(await screen.findByText(/queued for background processing/i)).toBeInTheDocument();
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();
  });

  test("DRAFT does NOT mount <BriefStream>", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "DRAFT" }}
        brief={null}
        overlay={null}
        clientResponded={false}
        latestAction={null}
      />,
    );
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();
    expect(await screen.findByText(/no brief yet/i)).toBeInTheDocument();
  });

  test("user clicks Generate → BriefStream mounts; stream error → inflight; click Generate again → stream", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "DRAFT" }}
        brief={null}
        overlay={null}
        clientResponded={false}
        latestAction={null}
      />,
    );
    const generateInitial = await screen.findByRole("button", { name: /generate brief/i });
    await userEvent.setup().click(generateInitial);

    expect(await screen.findByTestId("brief-stream-mounted")).toBeInTheDocument();
    expect(briefStreamSpy.onStreamError).toBeDefined();
    briefStreamSpy.onStreamError?.();

    const generateRetry = await screen.findByRole("button", { name: /generate brief/i });
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();

    await userEvent.setup().click(generateRetry);
    expect(await screen.findByTestId("brief-stream-mounted")).toBeInTheDocument();
  });
});
