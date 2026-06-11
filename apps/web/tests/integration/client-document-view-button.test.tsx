/**
 * Integration: the client portal "View" button opens the shared
 * DocumentViewerDialog inline (no new tab) pointed at the auth-gated /raw path.
 */
import { describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DocumentSummary } from "@mizan/shared";
import { ClientDocumentViewButton } from "../../src/components/portal/client-document-view-button.tsx";

const CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440000";
const DOC: DocumentSummary = {
  id: "doc-123",
  doc_kind: "creator_id",
  filename: "creator-id.png",
  content_type: "image/png",
  uploaded_at: 1_700_000_000_000,
};

describe("<ClientDocumentViewButton />", () => {
  test("opens the inline viewer at the /raw path on click (no anchor navigation)", async () => {
    const user = userEvent.setup();
    render(<ClientDocumentViewButton campaignId={CAMPAIGN_ID} doc={DOC} />);

    const trigger = screen.getByRole("button", { name: /view creator-id\.png/i });
    expect(trigger).not.toHaveAttribute("href");
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    await waitFor(() => {
      const img = document.querySelector("img");
      expect(img?.getAttribute("src")).toBe(
        `/api/portal/campaigns/${CAMPAIGN_ID}/documents/${DOC.id}/raw`,
      );
    });
  });
});
