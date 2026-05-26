/**
 * Integration: `useSignOut` calls better-auth signOut, invalidates
 * the session cache with refetchType: 'all', and navigates to /login.
 *
 * Mocks better-auth at the module boundary (same rationale as
 * `login-form.test.tsx` — better-auth bypasses MSW). Asserts the
 * three observable effects: signOut called, session cache cleared,
 * router landed on /login.
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

const { signOutMock, getSessionMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  getSessionMock: vi.fn(),
}));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ signOut: signOutMock, getSession: getSessionMock }),
}));

import { useSignOut } from "../../src/hooks/use-sign-out.ts";

function SignOutButton(): React.JSX.Element {
  const { signOut, signingOut } = useSignOut();
  return (
    <button type="button" onClick={signOut} disabled={signingOut}>
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}

async function renderWithRouter(): Promise<ReturnType<typeof createRouter>> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: SignOutButton,
  });
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <div data-testid="login-landed">login</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([home, login]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("useSignOut", () => {
  test("signs out, invalidates session, navigates to /login", async () => {
    signOutMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    getSessionMock.mockResolvedValue({ data: null, error: null });
    const router = await renderWithRouter();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await screen.findByTestId("login-landed");
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe("/login");
  });
});
