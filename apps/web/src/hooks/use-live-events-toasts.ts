import type { LiveEventRow } from "@mizan/shared";
import { toast } from "sonner";
import { COPY } from "@/lib/copy-constants.ts";

/**
 * Sonner toasts for user-scoped live assignment events.
 */
export function toastLiveEvent(event: LiveEventRow): void {
  if (event.payload.event_type === "case.assigned") {
    toast.success(COPY.realtime.assignedToast, { duration: 8_000 });
    return;
  }
  if (event.payload.event_type === "case.unassigned") {
    toast.message(COPY.realtime.unassignedToast, { duration: 4_000 });
  }
}
