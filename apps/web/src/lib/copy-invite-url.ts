import { toast } from "sonner";
import { COPY } from "@/lib/copy-constants.ts";

/**
 * Copies an invite URL with clipboard API fallback to execCommand.
 */
export async function copyInviteUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success(COPY.invite.linkCopied);
    return;
  } catch {
    /** Clipboard API rejected — fall through to execCommand. */
  }

  const previouslyFocused = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.focus();
    textarea.select();
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  }
  if (copied) {
    toast.success(COPY.invite.linkCopied);
    return;
  }

  throw new Error(COPY.invite.clipboardBlockedBody);
}
