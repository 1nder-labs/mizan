import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecommendationBadge } from "../../src/components/case/recommendation-badge.tsx";

describe("<RecommendationBadge />", () => {
  test.each([
    ["READY_FOR_REVIEW", "Ready"],
    ["REQUEST_DOCS", "Request docs"],
    ["ESCALATE", "Escalate"],
    ["BLOCK", "Block"],
  ] as const)("renders %s -> %s", (rec, label) => {
    render(<RecommendationBadge recommendation={rec} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
