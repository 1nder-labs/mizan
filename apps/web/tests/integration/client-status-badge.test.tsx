/**
 * Integration: the client status badge renders the friendly label for every
 * ClientStatus value.
 */
import { describe, expect, test } from "vitest";
import { render, within } from "@testing-library/react";
import type { ClientStatus } from "@mizan/shared";
import { ClientStatusBadge } from "../../src/components/portal/client-status-badge.tsx";

const CASES: ReadonlyArray<readonly [ClientStatus, string]> = [
  ["submitted", "Submitted"],
  ["under_review", "Under review"],
  ["needs_evidence", "Needs more evidence"],
  ["approved", "Approved"],
  ["under_further_review", "Under further review"],
  ["not_approved", "Not approved"],
];

describe("<ClientStatusBadge />", () => {
  test.each(CASES)("renders %s as its friendly label", (status, label) => {
    const { container } = render(<ClientStatusBadge status={status} />);
    expect(within(container).getByText(label)).toBeInTheDocument();
  });
});
