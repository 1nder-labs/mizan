import { Plus } from "lucide-react";
import type { ChatThread } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { ThreadRow } from "@/components/chat/chat-thread-row.tsx";

/**
 * Full-height conversation list for the copilot rail: heading, new-chat
 * action, and a scrollable list of {@link ThreadRow}s (each with an inline
 * rename + delete-with-confirm menu).
 */
export function ChatThreadList({
  threads,
  threadId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  readonly threads: readonly ChatThread[];
  readonly threadId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
  readonly onRename: (id: string, title: string) => void;
  readonly onDelete: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col p-2">
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <p className="truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {COPY.chat.threadsHeading}
        </p>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 shrink-0"
          aria-label={COPY.chat.newChat}
          onClick={onCreate}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto">
        {threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            active={threadId === thread.id}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
        {threads.length === 0 ? (
          <li className="px-2 py-1 text-xs text-muted-foreground">{COPY.chat.newConversation}</li>
        ) : null}
      </ul>
    </div>
  );
}
