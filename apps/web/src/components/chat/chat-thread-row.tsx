import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, type LucideIcon } from "lucide-react";
import type { ChatThread } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

function formatRelativeTime(updatedAt: number): string {
  const minutes = Math.floor((Date.now() - updatedAt) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function MenuButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly danger?: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
        danger && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function DeleteConfirm({
  onCancel,
  onConfirm,
}: {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): React.JSX.Element {
  return (
    <div className="space-y-2 p-1.5">
      <p className="px-1 text-xs text-foreground">{COPY.chat.deleteConfirm}</p>
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          {COPY.chat.cancel}
        </Button>
        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onConfirm}>
          {COPY.chat.deleteConfirmAction}
        </Button>
      </div>
    </div>
  );
}

function MenuActions({
  onRename,
  onDeleteIntent,
}: {
  readonly onRename: () => void;
  readonly onDeleteIntent: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col">
      <MenuButton icon={Pencil} label={COPY.chat.rename} onClick={onRename} />
      <MenuButton icon={Trash2} label={COPY.chat.delete} danger onClick={onDeleteIntent} />
    </div>
  );
}

/** Kebab menu: Rename (starts inline edit) + Delete (two-step inline confirm). */
function ThreadMenu({
  onRename,
  onDelete,
}: {
  readonly onRename: () => void;
  readonly onDelete: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const close = (): void => {
    setOpen(false);
    setConfirming(false);
  };
  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={COPY.chat.threadActions}
          className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={4} className="w-44 p-1">
        {confirming ? (
          <DeleteConfirm
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              onDelete();
              close();
            }}
          />
        ) : (
          <MenuActions
            onRename={() => {
              onRename();
              close();
            }}
            onDeleteIntent={() => setConfirming(true)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ThreadRowProps {
  readonly thread: ChatThread;
  readonly active: boolean;
  readonly onSelect: (id: string) => void;
  readonly onRename: (id: string, title: string) => void;
  readonly onDelete: (id: string) => void;
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  readonly initial: string;
  readonly onCommit: (next: string) => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <Input
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(value);
        if (event.key === "Escape") onCancel();
      }}
      className="h-7 text-xs"
    />
  );
}

export function ThreadRow({
  thread,
  active,
  onSelect,
  onRename,
  onDelete,
}: ThreadRowProps): React.JSX.Element {
  const [renaming, setRenaming] = useState(false);
  if (renaming) {
    return (
      <li>
        <RenameInput
          initial={thread.title}
          onCancel={() => setRenaming(false)}
          onCommit={(next) => {
            setRenaming(false);
            const trimmed = next.trim();
            if (trimmed && trimmed !== thread.title) onRename(thread.id, trimmed);
          }}
        />
      </li>
    );
  }
  return (
    <li className="group relative">
      <div
        className={cn(
          "flex items-center gap-1 rounded-md pr-1",
          active ? "bg-muted" : "hover:bg-muted/60",
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(thread.id)}
          className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-1.5 text-left"
        >
          <span className={cn("truncate text-xs", active && "font-medium")}>{thread.title}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(thread.updatedAt)}
          </span>
        </button>
        <ThreadMenu onRename={() => setRenaming(true)} onDelete={() => onDelete(thread.id)} />
      </div>
    </li>
  );
}
