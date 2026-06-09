/**
 * Graceful full-page fallback for any uncaught route loader/render error,
 * wired as the router's `defaultErrorComponent`. Renders inside `RootShell`
 * (theme + toast surface), so a thrown loader no longer dumps a bare error
 * onto a blank page.
 */
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { COPY } from "@/lib/copy-constants.ts";

export function RouteErrorState({ error, reset }: ErrorComponentProps): React.JSX.Element {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold">{COPY.error.title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{error.message || COPY.error.body}</p>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          {COPY.error.retry}
        </Button>
        <Button variant="outline" onClick={() => void router.navigate({ to: "/" })}>
          {COPY.error.home}
        </Button>
      </div>
    </div>
  );
}
