/**
 * Query-options + mutations for the per-user notification feed. Mirrors
 * `portal-api.ts`: one shared queryFn/queryKey pair, `assertAuthorized` on
 * every response, shared-schema parse. The list is kept live by the
 * `notification.new` SSE event (see `live-events-dispatch.ts`).
 */
import { queryOptions } from "@tanstack/react-query";
import {
  MarkReadResponseSchema,
  NotificationsResponseSchema,
  type MarkReadResponse,
  type NotificationsResponse,
} from "@mizan/shared";
import { api, apiMutate } from "./rpc.ts";
import { queryKeys } from "./query-keys.ts";
import { apiError, assertAuthorized } from "./api-errors.ts";

async function fetchNotifications(): Promise<NotificationsResponse> {
  const res = await api.notifications.$get();
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return NotificationsResponseSchema.parse(await res.json());
}

export function notificationsQueryOptions() {
  return queryOptions<NotificationsResponse>({
    queryKey: queryKeys.notifications.all,
    queryFn: fetchNotifications,
    /**
     * Freshness is driven by SSE (`notification.new` invalidates) + the
     * mark-read mutations, not by polling — so the feed does not re-hit the DB
     * on every mount/focus. The long staleTime is a backstop for the case where
     * the SSE stream is unavailable.
     */
    staleTime: 60_000,
  });
}

/** Marks one notification read; returns the viewer's remaining unread count. */
export async function markNotificationRead(id: string): Promise<MarkReadResponse> {
  const res = await apiMutate.notifications[":id"].read.$post({ param: { id } });
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return MarkReadResponseSchema.parse(await res.json());
}

/** Marks every unread notification read. */
export async function markAllNotificationsRead(): Promise<MarkReadResponse> {
  const res = await apiMutate.notifications["read-all"].$post();
  assertAuthorized(res.status);
  if (!res.ok) throw await apiError(res);
  return MarkReadResponseSchema.parse(await res.json());
}
