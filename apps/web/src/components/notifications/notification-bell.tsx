/**
 * Shared notification bell — used by both the reviewer shell and the client
 * portal shell. Reads the per-user feed, shows an unread badge, and opens a
 * popover list with per-item + mark-all read. Subscribes to the viewer's
 * `user:` SSE topic so new notifications land live wherever the bell is
 * mounted; the `notification.new` event invalidates the feed query (coalesced).
 * Selecting a notification marks it read and routes to its case — the reviewer
 * to `/case/$caseId`, the client to `/portal/campaigns/$campaignId`.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { m } from "framer-motion";
import type { Notification } from "@mizan/shared";
import { fadeUp, popItem, staggerParent } from "@/lib/motion.ts";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueryOptions,
} from "@/lib/notifications-api.ts";
import { meQueryOptions } from "@/lib/me-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { COPY } from "@/lib/copy-constants.ts";
import { useViewerTopics } from "@/hooks/use-viewer-topics.ts";
import { useLiveEvents } from "@/hooks/use-live-events.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

function NotificationItem({
  note,
  onSelect,
}: {
  readonly note: Notification;
  readonly onSelect: (note: Notification) => void;
}): React.JSX.Element {
  return (
    <m.button
      type="button"
      variants={fadeUp}
      onClick={() => onSelect(note)}
      className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground leading-snug">{note.title}</span>
        {note.read ? null : <span className="size-2 shrink-0 rounded-full bg-primary" />}
      </div>
      {note.caseTitle ? (
        <span className="text-xs text-muted-foreground">{note.caseTitle}</span>
      ) : null}
      <span className="text-xs text-muted-foreground break-words leading-relaxed">{note.body}</span>
      <span className="font-mono font-numeric text-[11px] text-muted-foreground/70 tabular mt-0.5">
        {new Date(note.createdAt).toLocaleString()}
      </span>
    </m.button>
  );
}

function NotificationList({
  notes,
  onSelect,
}: {
  readonly notes: readonly Notification[];
  readonly onSelect: (note: Notification) => void;
}): React.JSX.Element {
  if (notes.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
        {COPY.notifications.empty}
      </p>
    );
  }
  return (
    <m.div
      variants={staggerParent}
      initial="hidden"
      animate="show"
      className="max-h-80 space-y-0.5 overflow-y-auto"
    >
      {notes.map((note) => (
        <NotificationItem key={note.id} note={note} onSelect={onSelect} />
      ))}
    </m.div>
  );
}

/** Feed query + mark mutations + the live `user:` subscription that keeps it fresh. */
function useNotificationFeed() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { userId } = useViewerTopics();
  useLiveEvents(userId ? `user:${userId}` : "", { enabled: Boolean(userId) });
  const { data } = useQuery(notificationsQueryOptions());
  const { data: me } = useQuery(meQueryOptions());
  const readOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const goToCase = (caseId: string) => {
    if (me?.user.role === "client") {
      void navigate({ to: "/portal/campaigns/$campaignId", params: { campaignId: caseId } });
    } else {
      void navigate({ to: "/case/$caseId", params: { caseId } });
    }
  };
  const select = (note: Notification) => {
    if (!note.read) readOne.mutate(note.id);
    if (note.caseId) goToCase(note.caseId);
  };

  return {
    notes: data?.notifications ?? [],
    unread: data?.unread ?? 0,
    select,
    onReadAll: () => readAll.mutate(),
    readingAll: readAll.isPending,
  };
}

function BellButton({
  unread,
  ...props
}: { readonly unread: number } & React.ComponentProps<typeof Button>): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={COPY.notifications.open}
      {...props}
    >
      <Bell className="size-4" />
      {unread > 0 ? (
        <m.span
          key={unread}
          variants={popItem}
          initial="hidden"
          animate="show"
          className="absolute -right-1 -top-1"
        >
          <Badge className="size-4 justify-center p-0 text-[10px]">
            {unread > 9 ? "9+" : unread}
          </Badge>
        </m.span>
      ) : null}
    </Button>
  );
}

export function NotificationBell(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const { notes, unread, select, onReadAll, readingAll } = useNotificationFeed();
  const handleSelect = (note: Notification) => {
    select(note);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <BellButton unread={unread} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-elev-2">
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-3">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {COPY.notifications.title}
          </span>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={onReadAll}
              disabled={readingAll}
            >
              {COPY.notifications.markAll}
            </Button>
          ) : null}
        </div>
        <div className="p-1.5">
          <NotificationList notes={notes} onSelect={handleSelect} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
