/**
 * Root shell component. Owns global providers (theme + React Query), the toast
 * surface, and the typed router context (`{ queryClient }`) child
 * routes consume via `getRouteApi("__root__").useRouteContext()`.
 *
 * Devtools mount only under `import.meta.env.DEV` — Vite tree-shakes
 * the dynamic imports out of the production bundle.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { getRouteApi, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";

const rootApi = getRouteApi("__root__");

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-router-devtools").then((m) => ({
        default: m.TanStackRouterDevtools,
      })),
    )
  : null;

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/react-query-devtools").then((m) => ({
        default: m.ReactQueryDevtools,
      })),
    )
  : null;

export function RootShell(): React.JSX.Element {
  const { queryClient } = rootApi.useRouteContext();
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster />
        {TanStackRouterDevtools ? (
          <Suspense fallback={null}>
            <TanStackRouterDevtools position="bottom-right" />
          </Suspense>
        ) : null}
        {ReactQueryDevtools ? (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
          </Suspense>
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
