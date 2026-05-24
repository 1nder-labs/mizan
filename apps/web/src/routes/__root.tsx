/**
 * Root route. Provides typed router context (`{ queryClient }`) consumed
 * by child route loaders and `beforeLoad` hooks. Shell component lives in
 * `@/components/root-shell.tsx`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";
import { RootShell } from "@/components/root-shell.tsx";

interface RouterContext {
  readonly queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootShell,
});
