/**
 * Integration: login form blocks short passwords client-side, surfaces
 * server errors in the sibling Alert, and calls onAuthenticated on
 * success.
 */
import { afterEach, beforeAll, afterAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { startServer } from "../setup/msw-server.ts";
import { LoginForm } from "../../src/components/login/form.tsx";

const successHandler = http.post("/api/auth/sign-in/email", () =>
  HttpResponse.json({ token: "fake" }),
);

const errorHandler = http.post("/api/auth/sign-in/email", () =>
  HttpResponse.json({ message: "Invalid credentials" }, { status: 401 }),
);

const server = startServer([successHandler]);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers([successHandler]));
afterAll(() => server.close());

describe("<LoginForm /> integration", () => {
  test("rejects short password client-side without network call", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<LoginForm onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("Email"), "reviewer@launchgood.com");
    await user.type(screen.getByLabelText("Password"), "tooshort");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  test("calls onAuthenticated on 200 from better-auth", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<LoginForm onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("Email"), "reviewer@launchgood.com");
    await user.type(screen.getByLabelText("Password"), "CorrectHorseBattery99");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  test("renders server error in Alert on 401", async () => {
    server.use(errorHandler);
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    render(<LoginForm onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("Email"), "reviewer@launchgood.com");
    await user.type(screen.getByLabelText("Password"), "CorrectHorseBattery99");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Could not sign in")).toBeInTheDocument();
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
