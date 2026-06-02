import type { ChatThread } from "@mizan/shared";
import { cn } from "@/lib/utils.ts";
import { ChatThreadList } from "./chat-thread-list.tsx";

const RAIL_CONTENT_WIDTH = "w-56";

/**
 * Collapsible conversation rail. Animates between zero and a fixed width; the
 * inner column keeps its width so the list never reflows mid-transition.
 */
export function ChatThreadRail({
  open,
  threads,
  threadId,
  onSelect,
  onCreate,
}: {
  readonly open: boolean;
  readonly threads: readonly ChatThread[];
  readonly threadId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden border-r border-border/60 bg-muted/20 transition-[width] duration-200 ease-out",
        open ? RAIL_CONTENT_WIDTH : "w-0",
      )}
      aria-hidden={!open}
    >
      <div className={cn("flex h-full flex-col", RAIL_CONTENT_WIDTH)}>
        <ChatThreadList
          threads={threads}
          threadId={threadId}
          onSelect={onSelect}
          onCreate={onCreate}
        />
      </div>
    </div>
  );
}
