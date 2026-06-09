import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { COPY } from "@/lib/copy-constants.ts";

/** Shown when the clipboard is blocked — reveals the invite URL for manual copy. */
export function ClipboardFallbackDialog({
  url,
  open,
  onOpenChange,
}: {
  readonly url: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shadow-elev-3">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            {COPY.invite.clipboardBlockedTitle}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {COPY.invite.clipboardBlockedBody}
          </DialogDescription>
        </DialogHeader>
        <code className="font-mono font-numeric block select-all rounded-md border border-border/60 bg-muted px-3 py-2 text-xs text-foreground">
          {url}
        </code>
        <p className="text-xs text-muted-foreground">{COPY.invite.copyManuallyHint}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
