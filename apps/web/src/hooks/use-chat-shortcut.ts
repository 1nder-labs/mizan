import { useEffect } from "react";

const CHAT_SHORTCUT_KEY = "k";

/**
 * Registers Cmd/Ctrl+Shift+K to toggle the chat panel.
 */
export function useChatShortcut(onToggle: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const primary = event.metaKey || event.ctrlKey;
      if (!primary || !event.shiftKey || event.key.toLowerCase() !== CHAT_SHORTCUT_KEY) return;
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onToggle]);
}
