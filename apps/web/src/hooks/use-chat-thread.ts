import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { validateUIMessages } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COPY } from "@/lib/copy-constants.ts";
import { chatThreadQueryOptions, chatThreadsQueryOptions } from "@/lib/chat-api.ts";
import { queryKeys } from "@/lib/query-keys.ts";
import { apiMutate } from "@/lib/rpc.ts";
import { useChatTransport } from "@/hooks/use-chat-transport.ts";

/** Thread CRUD state for the copilot panel. */
export function useChatThread() {
  const queryClient = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const threads = useQuery(chatThreadsQueryOptions());

  const createThread = useMutation({
    mutationFn: async () => {
      const res = await apiMutate.chat.threads.$post({
        json: { title: COPY.chat.newConversation },
      });
      if (!res.ok) throw new Error("create thread failed");
      const body: { id?: string } = await res.json();
      if (!body.id) throw new Error("create thread missing id");
      return body.id;
    },
    onSuccess: async (id) => {
      setThreadId(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.threads() });
    },
  });

  useEffect(() => {
    if (threadId || createThread.isPending) return;
    const first = threads.data?.threads[0]?.id;
    if (first) {
      setThreadId(first);
      return;
    }
    void createThread.mutateAsync().catch(() => undefined);
  }, [threadId, createThread, threads.data?.threads]);

  return { threadId, setThreadId, createThread, threads };
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
