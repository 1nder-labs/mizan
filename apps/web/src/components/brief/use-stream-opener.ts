/**
 * Pins `sendMessage` to one POST per `caseId` mount. React 19
 * StrictMode mounts effects twice in dev; firing twice would race
 * the worker's producer guard.
 */
import { useEffect, useRef } from "react";

export function useStreamOpener(
  caseId: string,
  sendMessage: (input: { text: string }) => void,
): void {
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (openedFor.current === caseId) return;
    openedFor.current = caseId;
    sendMessage({ text: "" });
  }, [caseId, sendMessage]);
}
