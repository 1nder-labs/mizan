/**
 * Integration: ActionForm validation for HITL reviewer actions.
 */
import { describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionForm } from "../../src/components/case/action-form.tsx";

describe("<ActionForm />", () => {
  test("keeps rationale textarea visible for all actions", async () => {
    render(<ActionForm pending={false} onSubmit={async () => {}} />);
    expect(screen.getByLabelText(/rationale/i)).toBeInTheDocument();
  });

  test("disables submit when OVERRIDE selected with empty rationale", async () => {
    const user = userEvent.setup();
    render(<ActionForm pending={false} onSubmit={async () => {}} />);
    await user.click(screen.getByLabelText(/^override$/i));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled();
    });
    expect(screen.getByText(/rationale required/i)).toBeInTheDocument();
  });

  test("enables submit when OVERRIDE has 8+ char rationale", async () => {
    const user = userEvent.setup();
    render(<ActionForm pending={false} onSubmit={async () => {}} />);
    await user.click(screen.getByLabelText(/^override$/i));
    await user.type(screen.getByLabelText(/rationale required/i), "12345678");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeEnabled();
    });
  });
});
