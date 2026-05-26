import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { makeQueryClient } from "./lib/query-client.ts";
import { routeTree } from "./routeTree.gen.ts";
import "./globals.css";

/**
 * Bootstrap order: QueryClient is created first with a deferred
 * `onAuthFailure` hook that closes over `navigateToLogin`. The router
 * is built next; we then assign the actual navigate implementation
 * into the closure. This avoids a circular import (the auth-failure
 * hook needs the router, the router context needs the client) without
 * casting either type away.
 */
let navigateToLogin: () => void = () => {};

const queryClient = makeQueryClient({
  onAuthFailure: () => {
    queryClient.setQueryData(["session"], null);
    navigateToLogin();
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

navigateToLogin = () => {
  void router.navigate({ to: "/login" });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
