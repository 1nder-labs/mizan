/**
 * Top app-bar for `/queue` and `/admin/audit`. Holds the Mizan
 * wordmark, page-context label, and the sign-out action. Sign-out
 * routes through a shadcn `<Dialog>` confirmation so a stray click
 * doesn't drop the reviewer mid-task.
 */
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";

export function QueueHeader({
  context,
  onSignOut,
  signingOut,
}: {
  readonly context: string;
  readonly onSignOut: () => void;
  readonly signingOut: boolean;
}): React.JSX.Element {
  return (
    <header className="border-b border-border bg-card/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-tight">Mizan</span>
          <span className="text-xs text-muted-foreground">{context}</span>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={signingOut}>
              <LogOut className="mr-2 size-3.5" />
              Sign out
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Sign out of Mizan?</DialogTitle>
              <DialogDescription>
                Your active session will end and you’ll return to the login screen.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={signingOut}>
                Cancel
              </Button>
              <Button type="button" onClick={onSignOut} disabled={signingOut}>
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
