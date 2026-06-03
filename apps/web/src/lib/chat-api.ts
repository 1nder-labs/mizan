import { queryOptions } from "@tanstack/react-query";
import {
  ChatThreadDetailResponseSchema,
  ChatThreadListResponseSchema,
  type ChatThreadDetailResponse,
  type ChatThreadListResponse,
} from "@mizan/shared";
import { api } from "@/lib/rpc.ts";
import { apiError, assertAuthorized } from "@/lib/api-errors.ts";
import { queryKeys } from "@/lib/query-keys.ts";

export function chatThreadsQueryOptions() {
  return queryOptions<ChatThreadListResponse>({
    queryKey: queryKeys.chat.threads(),
    queryFn: async () => {
      const res = await api.chat.threads.$get({ query: { limit: "50" } });
      assertAuthorized(res.status);
      if (!res.ok) throw await apiError(res);
      return ChatThreadListResponseSchema.parse(await res.json());
    },
  });
}

export function chatThreadQueryOptions(threadId: string) {
  return queryOptions<ChatThreadDetailResponse>({
    queryKey: queryKeys.chat.thread(threadId),
    queryFn: async () => {
      const res = await api.chat.threads[":id"].$get({ param: { id: threadId } });
      assertAuthorized(res.status);
      if (!res.ok) throw await apiError(res);
      return ChatThreadDetailResponseSchema.parse(await res.json());
    },
  });
}
