/**
 * Integration: the portal sign-up form submits with `signupKind: "client"`
 * (the discriminator that provisions the client role), and surfaces server
 * errors without calling onAuthenticated. authClient is stubbed at the module
 * boundary (same rationale as login-form.test.tsx); the router `Link` is
 * stubbed so the form renders outside a RouterProvider.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { signUpMock } = vi.hoisted(() => ({ signUpMock: vi.fn() }));
vi.mock("@/lib/auth-client.ts", () => ({
  authClient: { signUp: { email: signUpMock } },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { readonly children: React.ReactNode }) => children,
}));

import { PortalSignupForm } from "../../src/components/portal/signup-form.tsx";

afterEach(() => signUpMock.mockReset());

function mount(onAuthenticated: () => void): ReturnType<typeof within> {
  const { container } = render(<PortalSignupForm onAuthenticated={onAuthenticated} />);
  return within(container);
}

async function fillValid(ui: ReturnType<typeof within>): Promise<void> {
  const user = userEvent.setup();
  await user.type(ui.getByLabelText(/full name/i), "Ahmad Hassan");
  await user.type(ui.getByLabelText(/email/i), "ahmad@example.com");
  await user.type(ui.getByLabelText(/password/i), "CorrectHorseBattery99");
  await user.click(ui.getByRole("button", { name: /create account/i }));
}

describe("<PortalSignupForm />", () => {
  test("signs up with signupKind=client and calls onAuthenticated", async () => {
    signUpMock.mockResolvedValueOnce({ data: { token: "t" }, error: null });
    const onAuthenticated = vi.fn();
    await fillValid(mount(onAuthenticated));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({ signupKind: "client", email: "ahmad@example.com" }),
    );
  });

  test("surfaces a server error without calling onAuthenticated", async () => {
    signUpMock.mockResolvedValueOnce({ data: null, error: { message: "Email taken" } });
    const onAuthenticated = vi.fn();
    const ui = mount(onAuthenticated);
    await fillValid(ui);

    await waitFor(() => expect(ui.getByText("Email taken")).toBeInTheDocument());
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
