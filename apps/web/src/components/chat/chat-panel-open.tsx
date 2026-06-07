import { useCallback, useEffect, useState } from "react";
import { DEFAULT_QUEUE_SEARCH } from "@mizan/shared";
import { Link } from "@tanstack/react-router";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { useChatPanelResize, type ChatPanelResize } from "@/hooks/use-chat-panel-resize.ts";
import { useChatThread } from "@/hooks/use-chat-thread.ts";
import { ChatPanelBody } from "@/components/chat/chat-panel-body.tsx";
import { ChatPanelHeader } from "@/components/chat/chat-panel-header.tsx";
import { ChatThreadRail } from "@/components/chat/chat-thread-rail.tsx";

const RAIL_WIDTH = 224;

/** CSSProperties permitting the `--chat-w` custom property without a cast. */
type ChatPanelStyle = React.CSSProperties & Record<`--${string}`, string>;

function useEscapeKey(onEscape: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}

function ChatPanelFooter(): React.JSX.Element {
  return (
    <div className="border-t border-border/40 px-4 py-1.5 text-[10px] text-muted-foreground/60 tracking-wide">
      <Link
        to="/queue"
        search={DEFAULT_QUEUE_SEARCH}
        className="transition-colors hover:text-muted-foreground"
      >
        {COPY.chat.backToQueue}
      </Link>
    </div>
  );
}

function ResizeHandle({ handleProps }: { readonly handleProps: ChatPanelResize["handleProps"] }) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={COPY.chat.resizeLabel}
      tabIndex={0}
      className={[
        "absolute inset-y-0 left-0 hidden w-1 cursor-ew-resize transition-colors",
        "hover:bg-border/60 focus-visible:bg-border focus-visible:outline-none lg:block",
      ].join(" ")}
      {...handleProps}
    />
  );
}

export function OpenChatPanel({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const { width, handleProps } = useChatPanelResize();
  const [historyOpen, setHistoryOpen] = useState(false);
  const { threadId, setThreadId, createThread, threads, onRename, onDelete } = useChatThread();
  useEscapeKey(onClose);

  const newChat = useCallback((): void => {
    void createThread.mutate();
    setHistoryOpen(false);
  }, [createThread]);

  const panelStyle: ChatPanelStyle = { "--chat-w": `${width + (historyOpen ? RAIL_WIDTH : 0)}px` };

  return (
    <aside
      aria-label={COPY.chat.panelTitle}
      style={panelStyle}
      className={cn(
        "fixed inset-0 z-50 flex flex-col border-border bg-background shadow-elev-3",
        "lg:inset-y-3 lg:right-3 lg:left-auto lg:z-40 lg:w-[var(--chat-w)] lg:rounded-2xl lg:border",
        "lg:transition-[width] lg:duration-200 lg:ease-out",
      )}
    >
      <ChatPanelHeader
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((prev) => !prev)}
        onNewChat={newChat}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatThreadRail
          open={historyOpen}
          threads={threads.data?.threads ?? []}
          threadId={threadId}
          onSelect={setThreadId}
          onCreate={() => void createThread.mutate()}
          onRename={onRename}
          onDelete={onDelete}
        />
        <ChatPanelBody threadId={threadId} />
      </div>
      <ChatPanelFooter />
      <ResizeHandle handleProps={handleProps} />
    </aside>
  );
}
