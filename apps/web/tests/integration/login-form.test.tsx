/**
 * Integration: login form blocks short passwords client-side, surfaces
 * server errors in the sibling Alert, and calls onAuthenticated on
 * success.
 *
 * Auth client is stubbed via `vi.mock` rather than intercepted via
 * MSW. better-auth ships its own `better-fetch` HTTP wrapper that
 * builds an absolute URL against `window.location.origin` (jsdom →
 * `http://localhost:3000`) before MSW's request interceptor sees the
 * call, and the resulting request goes straight to the network as a
 * loopback connect (ECONNREFUSED). Mocking at the authClient boundary
 * keeps tests pure and removes the cross-cutting MSW timing concern;
 * MSW remains the right tool for downstream RPC calls that go through
 * `fetch` directly (queue, cases, etc.).
 *
 * Why `within(container)` scoping: prior version queried `screen`
 * across tests. When RHF's zodResolver async validation overlapped
 * test boundaries, occasional duplicate-label / wrong-element bleed
 * showed up. Scoping every query to the render's own container
 * isolates each test hard.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
vi.mock("@/lib/auth-client.ts", () => ({
  authClient: { signIn: { email: signInMock } },
}));

import { LoginForm } from "../../src/components/login/form.tsx";

afterEach(() => {
  signInMock.mockReset();
});

function mountLogin(onAuthenticated: () => void): ReturnType<typeof within> {
  const { container } = render(<LoginForm onAuthenticated={onAuthenticated} />);
  return within(container);
}

describe("<LoginForm /> integration", () => {
  test("rejects short password client-side without network call", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    const ui = mountLogin(onAuthenticated);

    await user.type(ui.getByLabelText("Email"), "reviewer@launchgood.com");
    await user.type(ui.getByLabelText("Password"), "tooshort");
    await user.click(ui.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(ui.getByText(/at least 12 characters/i)).toBeInTheDocument();
    });
    expect(signInMock).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  test("calls onAuthenticated when better-auth returns no error", async () => {
    signInMock.mockResolvedValueOnce({ data: { token: "fake" }, error: null });
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    const ui = mountLogin(onAuthenticated);

    await user.type(ui.getByLabelText("Email"), "reviewer@launchgood.com");
    await user.type(ui.getByLabelText("Password"), "CorrectHorseBattery99");
    await user.click(ui.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  test("renders server error in Alert when better-auth returns error", async () => {
    signInMock.mockResolvedValueOnce({ data: null, error: { message: "Invalid credentials" } });
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    const ui = mountLogin(onAuthenticated);

    await user.type(ui.getByLabelText("Email"), "reviewer@launchgood.com");
    await user.type(ui.getByLabelText("Password"), "CorrectHorseBattery99");
    await user.click(ui.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(ui.getByText("Could not sign in")).toBeInTheDocument();
    });
    expect(ui.getByText("Invalid credentials")).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
