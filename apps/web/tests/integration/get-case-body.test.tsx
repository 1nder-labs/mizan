import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Stub TanStack Router's Link so GetCaseBody can render without a router. The
 * test target is the output-shape unwrapping, not navigation.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: React.ReactNode; params?: { caseId?: string } }) => (
    <span data-case-id={params?.caseId}>{children}</span>
  ),
}));

const { GetCaseBody } = await import("../../src/components/chat/tool-bodies/get-case-body.tsx");

/**
 * The real get_case tool output: `{ case: <CaseDetailResponse> }`, and the
 * detail response nests the case row again under its own `case` key. Regression
 * guard for the bug where the card read `output.case.id` (the wrapper, which has
 * no id) and rendered a misleading "Case not found".
 */
const TOOL_OUTPUT = {
  case: {
    case: {
      id: "c34d453d-c541-4807-b6f0-b057100cc38d",
      title: "Hira Welfare Trust",
      category: "education",
      status: "DRAFT",
      disposition: "SUBMITTED",
    },
    brief: null,
    overlay: { story: "Rebuilding a flooded school." },
    client_responded: false,
    latest_action: null,
    archived: false,
  },
};

describe("<GetCaseBody />", () => {
  test("renders the case from the nested get_case output shape", () => {
    render(<GetCaseBody output={TOOL_OUTPUT} />);
    expect(screen.getByText("Hira Welfare Trust")).toBeInTheDocument();
    expect(screen.getByText("c34d453d")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.queryByText("Case not found.")).not.toBeInTheDocument();
  });

  test("shows not-found only when no case row is present", () => {
    render(<GetCaseBody output={{ case: { brief: null } }} />);
    expect(screen.getByText("Case not found.")).toBeInTheDocument();
  });
});
