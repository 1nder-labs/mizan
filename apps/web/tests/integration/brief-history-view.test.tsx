/**
 * Integration: <BriefHistoryView /> gates the re-run affordance and the
 * version selector off the per-run history fetched via MSW. The Radix Select
 * portal itself is not driven (jsdom limitation — see queue-filter-url.test);
 * its presence is smoke-checked and the re-run wire to onGenerate is asserted.
 */
import { describe, expect, test, beforeAll, afterEach, afterAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { BriefHistoryResponse, BriefPayload, BriefSummary } from "@mizan/shared";
import { startServer } from "../setup/msw-server.ts";
import { BriefHistoryView } from "../../src/components/case/brief-history.tsx";

const PAYLOAD = {
  recommendation: "REQUEST_DOCS",
  verification_path: "documentary",
  geography_tier: "SAFE",
  policy_grounded: true,
  missing_docs: [],
  reviewer_questions: [],
  extracted_claims: "Verified claims summary.",
  confidence: 72,
  policy_citations: [],
} satisfies BriefPayload;

const LATEST: BriefSummary = {
  recommendation: "REQUEST_DOCS",
  confidence: 72,
  composed_at: 1_700_000_500_000,
  payload_json: PAYLOAD,
};

function historyResponse(count: number): BriefHistoryResponse {
  return {
    briefs: Array.from({ length: count }, (_unused, index) => ({
      run_id: `run-${index}`,
      recommendation: PAYLOAD.recommendation,
      confidence: 72 - index,
      composed_at: 1_700_000_500_000 - index * 1000,
      payload_json: PAYLOAD,
    })),
  };
}

let current: BriefHistoryResponse = historyResponse(1);
const server = startServer([http.get("/api/cases/:id/briefs", () => HttpResponse.json(current))]);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  server.resetHandlers();
  current = historyResponse(1);
});
afterAll(() => server.close());

function renderView(props: { readonly canRerun: boolean; readonly onGenerate?: () => void }): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BriefHistoryView
        caseId="11111111-1111-4111-8111-111111111111"
        latestBrief={LATEST}
        canRerun={props.canRerun}
        onGenerate={props.onGenerate ?? (() => {})}
      />
    </QueryClientProvider>,
  );
}

describe("<BriefHistoryView /> integration", () => {
  test("renders the latest brief and offers re-run when not terminal", async () => {
    const onGenerate = vi.fn();
    renderView({ canRerun: true, onGenerate });
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    const rerun = screen.getByRole("button", { name: /re-run review/i });
    await userEvent.setup().click(rerun);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  test("hides re-run for a terminal case", () => {
    renderView({ canRerun: false });
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-run review/i })).toBeNull();
  });

  test("shows no version selector for a single run", () => {
    current = historyResponse(1);
    renderView({ canRerun: true });
    expect(screen.queryByText("Brief version")).toBeNull();
  });

  test("shows the version selector once more than one run exists", async () => {
    current = historyResponse(2);
    renderView({ canRerun: true });
    expect(await screen.findByText("Brief version")).toBeInTheDocument();
  });
});
