import { useCallback, useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer.tsx";
import { ChatEmptyState } from "@/components/chat/chat-empty-state.tsx";
import { ChatMessages } from "@/components/chat/chat-message-list.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { useChatThreadChat } from "@/hooks/use-chat-thread.ts";

/**
 * Chat column for the active thread: persisted-history error, an empty state
 * (campaign starter prompts) or the streaming message log, and the composer.
 */
export function ChatPanelBody({
  threadId,
}: {
  readonly threadId: string | null;
}): React.JSX.Element {
  const [draft, setDraft] = useState("");
  const [showStoppedMarker, setShowStoppedMarker] = useState(false);
  const { chat, threadQuery, streaming, sendMessage } = useChatThreadChat(threadId);

  const sendCurrent = useCallback((): void => {
    setShowStoppedMarker(false);
    sendMessage(draft);
    setDraft("");
  }, [draft, sendMessage]);

  const showEmpty = chat.messages.length === 0 && !threadQuery.isLoading;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {threadQuery.isError ? (
        <p className="px-3 py-2 text-xs text-destructive">{COPY.chat.schemaDrift}</p>
      ) : null}
      {showEmpty ? (
        <div className="flex-1 overflow-y-auto">
          <ChatEmptyState onPickPrompt={setDraft} />
        </div>
      ) : (
        <ChatMessages
          messages={chat.messages}
          streaming={streaming}
          showStoppedMarker={showStoppedMarker}
          onRegenerate={() => chat.regenerate()}
        />
      )}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={sendCurrent}
        onStop={() => {
          setShowStoppedMarker(true);
          chat.stop();
        }}
        streaming={streaming}
      />
    </div>
  );
}
