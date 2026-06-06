/**
 * Shared notification bell — used by both the reviewer shell and the client
 * portal shell. Reads the per-user feed, shows an unread badge, and opens a
 * popover list with per-item + mark-all read. Subscribes to the viewer's
 * `user:` SSE topic so new notifications land live wherever the bell is
 * mounted; the `notification.new` event invalidates the feed query (coalesced).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import type { Notification } from "@mizan/shared";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueryOptions,
} from "@/lib/notifications-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { useViewerTopics } from "@/hooks/use-viewer-topics.ts";
import { useLiveEvents } from "@/hooks/use-live-events.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

function NotificationItem({
  note,
  onRead,
}: {
  readonly note: Notification;
  readonly onRead: (id: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => (note.read ? undefined : onRead(note.id))}
      className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-muted/50"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{note.title}</span>
        {note.read ? null : <span className="size-2 shrink-0 rounded-full bg-primary" />}
      </div>
      <span className="text-sm text-muted-foreground break-words">{note.body}</span>
      <span className="text-[11px] text-muted-foreground tabular">
        {new Date(note.createdAt).toLocaleString()}
      </span>
    </button>
  );
}

function NotificationList({
  notes,
  onRead,
}: {
  readonly notes: readonly Notification[];
  readonly onRead: (id: string) => void;
}): React.JSX.Element {
  if (notes.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {COPY.notifications.empty}
      </p>
    );
  }
  return (
    <div className="max-h-80 space-y-1 overflow-y-auto">
      {notes.map((note) => (
        <NotificationItem key={note.id} note={note} onRead={onRead} />
      ))}
    </div>
  );
}

/** Feed query + mark mutations + the live `user:` subscription that keeps it fresh. */
function useNotificationFeed() {
  const queryClient = useQueryClient();
  const { userId } = useViewerTopics();
  useLiveEvents(userId ? `user:${userId}` : "", { enabled: Boolean(userId) });
  const { data } = useQuery(notificationsQueryOptions());
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  const readOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });
  return {
    notes: data?.notifications ?? [],
    unread: data?.unread ?? 0,
    onRead: (id: string) => readOne.mutate(id),
    onReadAll: () => readAll.mutate(),
    readingAll: readAll.isPending,
  };
}

function BellButton({ unread }: { readonly unread: number }): React.JSX.Element {
  return (
    <Button variant="ghost" size="icon" className="relative" aria-label={COPY.notifications.open}>
      <Bell className="size-4" />
      {unread > 0 ? (
        <Badge className="absolute -right-1 -top-1 size-4 justify-center p-0 text-[10px]">
          {unread > 9 ? "9+" : unread}
        </Badge>
      ) : null}
    </Button>
  );
}

export function NotificationBell(): React.JSX.Element {
  const { notes, unread, onRead, onReadAll, readingAll } = useNotificationFeed();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <BellButton unread={unread} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-sm font-semibold">{COPY.notifications.title}</span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onReadAll}
              disabled={readingAll}
            >
              {COPY.notifications.markAll}
            </Button>
          ) : null}
        </div>
        <NotificationList notes={notes} onRead={onRead} />
      </PopoverContent>
    </Popover>
  );
}
