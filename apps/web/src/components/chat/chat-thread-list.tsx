import { Plus } from "lucide-react";
import type { ChatThread } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { ThreadRow } from "@/components/chat/chat-thread-row.tsx";

/** Rail heading + new-chat action. */
function ThreadListHeader({ onCreate }: { readonly onCreate: () => void }): React.JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-2 pt-1">
      <p className="truncate text-[10px] uppercase tracking-[0.2em] font-medium text-muted-foreground/70">
        {COPY.chat.threadsHeading}
      </p>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={COPY.chat.newChat}
        onClick={onCreate}
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

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
      <ThreadListHeader onCreate={onCreate} />
      <ul className="flex-1 space-y-px overflow-y-auto">
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
          <li className="px-3 py-2 text-[11px] text-muted-foreground/60">
            {COPY.chat.newConversation}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
