import { PanelLeft, Plus, X, BrainCircuit } from "lucide-react";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";

function HeaderIconButton({
  label,
  onClick,
  pressed,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * Copilot panel header: threads toggle, title + shortcut, new-chat, close.
 */
export function ChatPanelHeader({
  historyOpen,
  onToggleHistory,
  onNewChat,
  onClose,
}: {
  readonly historyOpen: boolean;
  readonly onToggleHistory: () => void;
  readonly onNewChat: () => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  return (
    <header className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2.5">
      <HeaderIconButton
        label={COPY.chat.toggleThreads}
        pressed={historyOpen}
        onClick={onToggleHistory}
      >
        <PanelLeft className="size-4" />
      </HeaderIconButton>
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <BrainCircuit className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="truncate text-sm font-semibold tracking-[-0.01em] leading-none">
          {COPY.chat.panelTitle}
        </p>
        <span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 sm:block">
          {COPY.chat.shortcutHint}
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs font-medium"
        onClick={onNewChat}
      >
        <Plus className="size-3" />
        {COPY.chat.newChat}
      </Button>
      <HeaderIconButton label={COPY.chat.panelClose} onClick={onClose}>
        <X className="size-4" />
      </HeaderIconButton>
    </header>
  );
}
