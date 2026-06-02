import { useCallback, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useChatShortcut } from "@/hooks/use-chat-shortcut.ts";
import { useIsMobile } from "@/hooks/use-mobile.tsx";
import { useSidebar } from "@/components/ui/sidebar-context.ts";
import { OpenChatPanel } from "@/components/chat/chat-panel-open.tsx";

const STORAGE_KEY = "mizan:chat:open";

function readInitialOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function ChatPanel(): React.JSX.Element {
  const [open, setOpen] = useState(readInitialOpen);
  const isMobile = useIsMobile();
  const sidebar = useSidebar();
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      if (isMobile && next) sidebar.setOpen(false);
      return next;
    });
  }, [isMobile, sidebar]);

  useChatShortcut(toggle);
  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="fixed bottom-4 right-4 z-40 shadow-elev-2 lg:bottom-6 lg:right-6"
        onClick={toggle}
      >
        <MessageSquare className="mr-2 size-4" />
        Copilot
      </Button>
    );
  }
  return <OpenChatPanel onClose={toggle} />;
}
