import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaseStatusBadge } from "../../src/components/case-status-badge.tsx";

describe("<CaseStatusBadge />", () => {
  test("renders the human label for each enum value", () => {
    const cases = [
      { status: "DRAFT" as const, label: "Draft" },
      { status: "QUEUED" as const, label: "Queued" },
      { status: "RUNNING" as const, label: "Running" },
      { status: "SUSPENDED_HITL" as const, label: "Awaiting reviewer" },
      { status: "ACTIONED" as const, label: "Actioned" },
      { status: "FAILED" as const, label: "Failed" },
    ];
    for (const c of cases) {
      const { unmount } = render(<CaseStatusBadge status={c.status} />);
      expect(screen.getByText(c.label)).toBeInTheDocument();
      unmount();
    }
  });
});
