import { useCallback, useState } from "react";
import { MessageSquare } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { Button } from "@/components/ui/button.tsx";
import { DUR_BASE, EASE_OUT } from "@/lib/motion.ts";
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
  return (
    <>
      <AnimatePresence>
        {open ? (
          <m.div
            key="copilot-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR_BASE, ease: EASE_OUT }}
          >
            <OpenChatPanel onClose={toggle} />
          </m.div>
        ) : null}
      </AnimatePresence>
      {open ? null : <CopilotFab onOpen={toggle} />}
    </>
  );
}

/** Floating launcher shown while the panel is closed; springs on hover/tap. */
function CopilotFab({ onOpen }: { readonly onOpen: () => void }): React.JSX.Element {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: DUR_BASE, ease: EASE_OUT }}
      className="fixed bottom-4 right-4 z-40 lg:bottom-6 lg:right-6"
    >
      <Button type="button" size="sm" variant="outline" className="shadow-elev-2" onClick={onOpen}>
        <MessageSquare className="mr-2 size-4" />
        Copilot
      </Button>
    </m.div>
  );
}
