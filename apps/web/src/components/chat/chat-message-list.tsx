import { useChat } from "@ai-sdk/react";
import { useEffect, useRef } from "react";
import { COPY } from "@/lib/copy-constants.ts";
import { Markdown } from "@/lib/markdown.tsx";
import { ToolCallCard } from "@/components/chat/tool-call-card.tsx";

const SCROLL_THRESHOLD_PX = 40;

/**
 * Keeps a scroll container pinned to the bottom as messages stream in, unless
 * the user has scrolled up. Resets to pinned when the thread changes (the first
 * message id changes), so a freshly-loaded thread always shows its newest turn.
 */
function useStickToBottom(
  messages: ReturnType<typeof useChat>["messages"],
  streaming: boolean,
): { containerRef: React.RefObject<HTMLDivElement | null>; onScroll: () => void } {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const firstIdRef = useRef<string | undefined>(undefined);
  const firstId = messages.at(0)?.id;

  useEffect(() => {
    if (firstIdRef.current !== firstId) {
      firstIdRef.current = firstId;
      stickToBottomRef.current = true;
    }
    const node = containerRef.current;
    if (!node || !stickToBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, streaming, firstId]);

  const onScroll = (): void => {
    const node = containerRef.current;
    if (!node) return;
    stickToBottomRef.current =
      node.scrollTop + node.clientHeight >= node.scrollHeight - SCROLL_THRESHOLD_PX;
  };

  return { containerRef, onScroll };
}

function formatAssistantText(text: string, showStopped: boolean): string {
  if (!showStopped || text.includes(COPY.chat.stoppedMarker)) return text;
  return `${text}\n\n${COPY.chat.stoppedMarker}`;
}

function MessageParts({
  message,
  showStopped,
  onRegenerate,
}: {
  readonly message: ReturnType<typeof useChat>["messages"][number];
  readonly showStopped: boolean;
  readonly onRegenerate: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        const partKey = `${message.id}-${part.type}-${index}`;
        if (part.type === "text") {
          const display =
            message.role === "assistant" && showStopped
              ? formatAssistantText(part.text, true)
              : part.text;
          return (
            <div
              key={partKey}
              className={`rounded-md px-3 py-2 text-sm ${message.role === "user" ? "bg-muted" : "bg-card border border-border/40"}`}
            >
              <Markdown>{display}</Markdown>
            </div>
          );
        }
        if (part.type.startsWith("tool-")) {
          return <ToolCallCard key={partKey} part={part} onRetry={onRegenerate} />;
        }
        return null;
      })}
    </div>
  );
}

/**
 * Streaming-aware message log with auto-scroll and tool-call frames.
 */
export function ChatMessages({
  messages,
  streaming,
  showStoppedMarker,
  onRegenerate,
}: {
  readonly messages: ReturnType<typeof useChat>["messages"];
  readonly streaming: boolean;
  readonly showStoppedMarker: boolean;
  readonly onRegenerate: () => void;
}): React.JSX.Element {
  const { containerRef, onScroll } = useStickToBottom(messages, streaming);
  const lastId = messages.at(-1)?.id;

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-atomic="false"
      className="flex-1 space-y-3 overflow-y-auto p-3"
      onScroll={onScroll}
    >
      {messages.map((message) => (
        <MessageParts
          key={message.id}
          message={message}
          showStopped={showStoppedMarker && message.id === lastId}
          onRegenerate={onRegenerate}
        />
      ))}
    </div>
  );
}
