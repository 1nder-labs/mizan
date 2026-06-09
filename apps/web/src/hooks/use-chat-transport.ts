import { useMemo } from "react";
import { useMatchRoute, useParams } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";

interface ChatTransportContext {
  readonly route: string;
  readonly caseId: string | null;
}

/**
 * Builds the AI SDK 6 chat transport for Mizan Copilot.
 */
export function useChatTransport(threadId: string | null): DefaultChatTransport<UIMessage> {
  const matchRoute = useMatchRoute();
  const params = useParams({ strict: false });
  const context = useMemo((): ChatTransportContext => {
    if (matchRoute({ to: "/case/$caseId" })) {
      const caseId = params.caseId;
      return { route: "/case/$caseId", caseId: typeof caseId === "string" ? caseId : null };
    }
    return { route: "/queue", caseId: null };
  }, [matchRoute, params.caseId]);

  return useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => {
          if (!threadId) {
            throw new Error("chat threadId required before send");
          }
          return {
            body: {
              ...body,
              threadId,
              messages,
              context,
            },
          };
        },
      }),
    [context, threadId],
  );
}
