import { Plus } from "lucide-react";
import type { ChatThread } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";

function formatRelativeTime(updatedAt: number): string {
  const deltaMs = Date.now() - updatedAt;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Vertical thread picker with relative timestamps and new-conversation action.
 */
export function ChatThreadList({
  threads,
  threadId,
  onSelect,
  onCreate,
}: {
  readonly threads: readonly ChatThread[];
  readonly threadId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
}): React.JSX.Element {
  return (
    <div className="border-b border-border/60 p-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Threads</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onCreate}
        >
          <Plus className="size-3" />
          New
        </Button>
      </div>
      <ul className="max-h-28 space-y-1 overflow-y-auto">
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${threadId === thread.id ? "bg-muted font-medium" : "hover:bg-muted/60"}`}
              onClick={() => onSelect(thread.id)}
            >
              <span className="truncate">{thread.title}</span>
              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                {formatRelativeTime(thread.updatedAt)}
              </span>
            </button>
          </li>
        ))}
        {threads.length === 0 ? (
          <li className="px-2 py-1 text-xs text-muted-foreground">{COPY.chat.newConversation}</li>
        ) : null}
      </ul>
    </div>
  );
}
