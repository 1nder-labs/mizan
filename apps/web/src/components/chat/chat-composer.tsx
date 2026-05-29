import { COPY } from "@/lib/copy-constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

/**
 * Copilot composer with send/stop and keyboard shortcuts.
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
  return (
    <div className="border-t border-border/60 p-3">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={COPY.chat.composerPlaceholder}
        rows={3}
        disabled={streaming}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!streaming) onSend();
          }
        }}
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={streaming ? onStop : onSend}
          disabled={!streaming && value.trim().length === 0}
        >
          {streaming ? COPY.chat.stopLabel : COPY.chat.sendLabel}
        </Button>
      </div>
    </div>
  );
}
