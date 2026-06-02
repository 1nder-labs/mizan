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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{COPY.invite.clipboardBlockedTitle}</DialogTitle>
          <DialogDescription>{COPY.invite.clipboardBlockedBody}</DialogDescription>
        </DialogHeader>
        <code className="block truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
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
