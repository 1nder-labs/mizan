import type { KeyboardEvent } from "react";
import { SendHorizontal, Square } from "lucide-react";
import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

/** Enter sends (when allowed), Shift+Enter newlines, Escape blurs. */
function handleComposerKey(
  event: KeyboardEvent<HTMLTextAreaElement>,
  canSend: boolean,
  onSend: () => void,
): void {
  if (event.key === "Escape") {
    event.currentTarget.blur();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (canSend) onSend();
  }
}

/** Inline send / stop affordance for the composer pill. */
function ComposerSendButton({
  streaming,
  value,
  onSend,
  onStop,
}: {
  readonly streaming: boolean;
  readonly value: string;
  readonly onSend: () => void;
  readonly onStop: () => void;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      size="icon"
      variant={streaming ? "outline" : "default"}
      className="mb-0.5 size-7 shrink-0 rounded-lg"
      onClick={streaming ? onStop : onSend}
      disabled={!streaming && value.trim().length === 0}
      aria-label={streaming ? COPY.chat.stopLabel : COPY.chat.sendLabel}
    >
      {streaming ? (
        <Square className="size-3" />
      ) : (
        <SendHorizontal className="size-3.5" strokeWidth={2.25} />
      )}
    </Button>
  );
}

/**
 * Compact copilot composer: a single auto-growing input pill with an inline
 * send/stop affordance.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly streaming: boolean;
}): React.JSX.Element {
  const canSend = !streaming && value.trim().length > 0;
  return (
    <div className="border-t border-border/40 px-3 py-3">
      <div
        className={[
          "flex items-end gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2",
          "shadow-elev-1 transition-[border-color,box-shadow] duration-150",
          "focus-within:border-border focus-within:shadow-elev-2",
        ].join(" ")}
      >
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => handleComposerKey(event, canSend, onSend)}
          placeholder={COPY.chat.composerPlaceholder}
          rows={1}
          disabled={streaming}
          aria-label={COPY.chat.composerPlaceholder}
          className={[
            "max-h-[140px] min-h-8 flex-1 resize-none border-0 bg-transparent px-0 py-1",
            "text-sm leading-relaxed shadow-none [field-sizing:content]",
            "placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0",
            "disabled:opacity-40",
          ].join(" ")}
        />
        <ComposerSendButton streaming={streaming} value={value} onSend={onSend} onStop={onStop} />
      </div>
    </div>
  );
}
