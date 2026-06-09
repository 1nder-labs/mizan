import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { validateUIMessages } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatThreadCreatedResponseSchema } from "@mizan/shared";
import { COPY } from "@/lib/copy-constants.ts";
import {
  chatThreadQueryOptions,
  chatThreadsQueryOptions,
  deleteThread,
  renameThread,
} from "@/lib/chat-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { apiMutate } from "@/lib/rpc.ts";
import { useChatTransport } from "@/hooks/use-chat-transport.ts";

/** Rename + delete mutations; deleting the active thread clears the selection. */
function useThreadMutations(threadId: string | null, clearSelection: () => void) {
  const queryClient = useQueryClient();
  const renameMutation = useMutation({
    mutationFn: (input: { id: string; title: string }) => renameThread(input.id, input.title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.threads() }),
    onError: () => toast.error(COPY.chat.renameError),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteThread(id),
    onSuccess: (_data, id) => {
      if (id === threadId) clearSelection();
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.threads() });
    },
    onError: () => toast.error(COPY.chat.deleteError),
  });
  return {
    onRename: (id: string, title: string) => renameMutation.mutate({ id, title }),
    onDelete: (id: string) => deleteMutation.mutate(id),
  };
}

/** Thread CRUD state for the copilot panel. */
export function useChatThread() {
  const queryClient = useQueryClient();
  /**
   * `selectedId` holds the user-chosen or newly-created thread. When null
   * we fall back to the first thread from the server list during render —
   * no effect-driven setState required for the common case.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const threads = useQuery(chatThreadsQueryOptions());

  const firstId = threads.data?.threads[0]?.id ?? null;
  const threadId = selectedId ?? firstId;

  const createThread = useMutation({
    mutationFn: async () => {
      const res = await apiMutate.chat.threads.$post({
        json: { title: COPY.chat.newConversation },
      });
      if (!res.ok) throw new Error("create thread failed");
      return ChatThreadCreatedResponseSchema.parse(await res.json()).id;
    },
    onSuccess: async (id) => {
      setSelectedId(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.threads() });
    },
  });

  /**
   * Create the first thread when the list is loaded and empty. Runs only
   * when there is no existing thread and no creation is in-flight — the
   * effect does not set state directly; it delegates to `createThread`
   * whose `onSuccess` sets `selectedId`.
   */
  useEffect(() => {
    if (threads.isLoading || threads.data === undefined) return;
    if (threadId || createThread.isPending) return;
    void createThread.mutateAsync().catch(() => undefined);
  }, [threads.isLoading, threads.data, threadId, createThread]);

  const { onRename, onDelete } = useThreadMutations(threadId, () => setSelectedId(null));

  return { threadId, setThreadId: setSelectedId, createThread, threads, onRename, onDelete };
}

async function hydrateThreadMessages(
  chat: ReturnType<typeof useChat>,
  messages: Record<string, unknown>[],
): Promise<void> {
  const validated = await validateUIMessages({ messages });
  chat.setMessages(validated);
}

/** Binds useChat to the active thread with persisted history hydration. */
export function useChatThreadChat(threadId: string | null) {
  const transport = useChatTransport(threadId);
  const chat = useChat({ id: threadId ?? "draft", transport });
  const threadQuery = useQuery({
    ...chatThreadQueryOptions(threadId ?? ""),
    enabled: Boolean(threadId),
    retry: 0,
  });

  /**
   * Hydrate persisted history once per thread. Re-running on every
   * `threadQuery.data` change would clobber an in-progress stream when the
   * thread cache invalidates mid-response.
   */
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || !threadQuery.data) return;
    if (hydratedFor.current === threadId) return;
    hydratedFor.current = threadId;
    void hydrateThreadMessages(chat, threadQuery.data.messages).catch(() => undefined);
  }, [threadId, threadQuery.data, chat]);

  const streaming = chat.status === "streaming" || chat.status === "submitted";
  const sendMessage = useCallback(
    (text: string) => {
      if (!threadId || !text.trim()) return;
      void chat.sendMessage({ text: text.trim() });
    },
    [chat, threadId],
  );

  return { chat, threadQuery, streaming, sendMessage };
}
