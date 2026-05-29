import { useEffect } from "react";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { ChatPanelBody } from "@/components/chat/chat-panel-body.tsx";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

export function OpenChatPanel({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside
      aria-label={COPY.chat.panelTitle}
      className="fixed inset-y-0 right-0 z-40 flex w-[380px] translate-x-0 flex-col border-l border-border bg-background shadow-elev-2 transition-transform duration-200 max-lg:inset-0 max-lg:z-50 max-lg:w-full"
    >
      <header className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div>
          <p className="text-sm font-semibold">{COPY.chat.panelTitle}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Cmd+Shift+K
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={COPY.chat.panelClose}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>
      <ChatPanelBody />
      <div className="border-t border-border/40 px-3 py-2 text-[10px] text-muted-foreground">
        <Link to="/queue" search={DEFAULT_QUEUE_SEARCH}>
          Back to queue
        </Link>
      </div>
    </aside>
  );
}
