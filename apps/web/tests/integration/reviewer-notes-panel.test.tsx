/**
 * Integration: ReviewerNotesPanel renders both the client thread and the
 * internal notes section from MSW-mocked `GET /api/cases/:id/notes`.
 *
 * Two-Cards layout keeps both sections in the DOM simultaneously, so both
 * note classes are assertable without tab-switching.
 *
 * Harness: QueryClientProvider (retry:false) wrapping the component
 * directly — no RouterProvider needed because the panel uses no router
 * hooks. MSW intercepts the `/api/cases/:id/notes` GET.
 */
import { describe, expect, test, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { CaseNotesResponse } from "@mizan/shared";
import { startServer } from "../setup/msw-server.ts";
import { ReviewerNotesPanel } from "../../src/components/case/notes-panel.tsx";

const CASE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const FIXTURE: CaseNotesResponse = {
  notes: [
    {
      id: "note-1",
      authorRole: "reviewer",
      authorUserId: "reviewer-1",
      visibility: "client_facing",
      body: "Please provide a bank statement for the last three months.",
      createdAt: 1_700_000_000_000,
    },
    {
      id: "note-2",
      authorRole: "client",
      authorUserId: "client-1",
      visibility: "client_facing",
      body: "I have uploaded the bank statement now.",
      createdAt: 1_700_000_100_000,
    },
    {
      id: "note-3",
      authorRole: "reviewer",
      authorUserId: "reviewer-1",
      visibility: "internal",
      body: "Escalate to senior reviewer — address does not match.",
      createdAt: 1_700_000_200_000,
    },
  ],
};

const server = startServer([
  http.get(`/api/cases/${CASE_ID}/notes`, () => HttpResponse.json(FIXTURE)),
]);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPanel(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReviewerNotesPanel caseId={CASE_ID} />
    </QueryClientProvider>,
  );
}

describe("<ReviewerNotesPanel /> integration", () => {
  test("renders client_facing notes in the client thread section", async () => {
    renderPanel();
    expect(
      await screen.findByText("Please provide a bank statement for the last three months."),
    ).toBeInTheDocument();
    expect(screen.getByText("I have uploaded the bank statement now.")).toBeInTheDocument();
  });

  test("renders internal note in the internal notes section", async () => {
    renderPanel();
    await waitFor(() => {
      expect(
        screen.getByText("Escalate to senior reviewer — address does not match."),
      ).toBeInTheDocument();
    });
  });

  test("labels client-authored note with the client label", async () => {
    renderPanel();
    await screen.findByText("I have uploaded the bank statement now.");
    const clientLabels = screen.getAllByText("Client");
    expect(clientLabels.length).toBeGreaterThanOrEqual(1);
  });

  test("labels reviewer-authored note with the reviewer label", async () => {
    renderPanel();
    await screen.findByText("Please provide a bank statement for the last three months.");
    const reviewerLabels = screen.getAllByText("Reviewer");
    expect(reviewerLabels.length).toBeGreaterThanOrEqual(1);
  });
});
