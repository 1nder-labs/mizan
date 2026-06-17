/**
 * Integration: case-detail container × BriefStream — routing decision
 * AND the lifecycle across component boundaries.
 *
 * Durable-resume contract: an in-flight case (RUNNING / QUEUED) mounts
 * <BriefStream> with `autoStart=false`, so the SDK reconnects to the
 * durable DO buffer via a resume-GET instead of POSTing a duplicate
 * run. A page-load POST-storm is prevented by `autoStart` (only a
 * user click sets it true), not by withholding the component. DRAFT
 * shows the empty card with no stream.
 *
 * BriefStream is replaced with a controllable test double that exposes
 * its `autoStart` prop and wires `onStreamError` through a captured
 * ref. That lets a test fire the error from outside while the parent
 * owns the phaseReducer, exercising the flow a production SSE failure
 * would trigger.
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
  BriefStream: ({
    caseId,
    autoStart,
    onStreamError,
  }: {
    caseId: string;
    autoStart: boolean;
    onStreamError?: () => void;
  }) => {
    briefStreamSpy.onStreamError = onStreamError;
    return (
      <div data-testid="brief-stream-mounted" data-auto-start={String(autoStart)}>
        stream:{caseId}
      </div>
    );
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
  disposition: "IN_REVIEW",
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
  test("RUNNING status mounts <BriefStream> in resume-only mode (no page-load POST)", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail caseRow={baseCase} brief={null} overlay={null} archived={false} />,
    );
    const mounted = await screen.findByTestId("brief-stream-mounted");
    expect(mounted).toHaveAttribute("data-auto-start", "false");
  });

  test("QUEUED status mounts <BriefStream> in resume-only mode", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "QUEUED" }}
        brief={null}
        overlay={null}
        archived={false}
      />,
    );
    const mounted = await screen.findByTestId("brief-stream-mounted");
    expect(mounted).toHaveAttribute("data-auto-start", "false");
  });

  test("DRAFT does NOT mount <BriefStream>", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "DRAFT" }}
        brief={null}
        overlay={null}
        archived={false}
      />,
    );
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();
    expect(await screen.findByText(/no brief yet/i)).toBeInTheDocument();
  });

  test("DRAFT: Generate mounts stream; stream error unmounts to empty; Generate again re-mounts", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail
        caseRow={{ ...baseCase, status: "DRAFT" }}
        brief={null}
        overlay={null}
        archived={false}
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

  /**
   * #9 reconnect: a RUNNING case whose live SSE drops mid-run must NOT freeze on
   * the stream panel. deriveMode flips RUNNING+streamErrored → empty, surfacing
   * the reconnect CTA; clicking it re-mounts BriefStream with autoStart=true so
   * the POST rejoins the still-RUNNING DO (the producer guard replays, no 409).
   */
  test("RUNNING + mid-run stream error surfaces a reconnect CTA that re-mounts the stream", async () => {
    briefStreamSpy.onStreamError = undefined;
    await renderDetail(
      <CaseDetail caseRow={baseCase} brief={null} overlay={null} archived={false} />,
    );
    const mounted = await screen.findByTestId("brief-stream-mounted");
    expect(mounted).toHaveAttribute("data-auto-start", "false");
    expect(briefStreamSpy.onStreamError).toBeDefined();

    briefStreamSpy.onStreamError?.();

    const reconnect = await screen.findByRole("button", { name: /generate brief/i });
    expect(screen.queryByTestId("brief-stream-mounted")).toBeNull();

    await userEvent.setup().click(reconnect);
    const remounted = await screen.findByTestId("brief-stream-mounted");
    expect(remounted).toHaveAttribute("data-auto-start", "true");
  });
});
