/**
 * Graceful full-page fallback for unmatched routes, wired as the router's
 * `defaultNotFoundComponent` so a deep link to a missing path shows a real
 * page instead of a bare "Not Found" string.
 */
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button.tsx";
import { COPY } from "@/lib/copy-constants.ts";

export function RouteNotFound(): React.JSX.Element {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">404</h1>
      <p className="max-w-md text-sm text-muted-foreground">{COPY.error.notFound}</p>
      <Button onClick={() => void router.navigate({ to: "/" })}>{COPY.error.home}</Button>
    </div>
  );
}
