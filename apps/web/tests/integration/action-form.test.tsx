/**
 * Integration: ActionForm validation for HITL reviewer actions.
 */
import { describe, expect, test, vi } from "vitest";
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

  test("disables submit when BLOCK selected with empty rationale", async () => {
    const user = userEvent.setup();
    render(<ActionForm pending={false} onSubmit={async () => {}} />);
    await user.click(screen.getByLabelText(/^block$/i));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled();
    });
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

  test("forwards mount-time action_id to onSubmit (Layer 4 idempotency contract)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    render(<ActionForm pending={false} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const firstPayload = onSubmit.mock.calls[0]?.[0] as { action_id: string };
    expect(firstPayload.action_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
    const secondPayload = onSubmit.mock.calls[1]?.[0] as { action_id: string };
    expect(secondPayload.action_id).toBe(firstPayload.action_id);
  });
});
