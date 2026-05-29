import { useCallback, useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer.tsx";
import { ChatEmptyState } from "@/components/chat/chat-empty-state.tsx";
import { ChatMessages } from "@/components/chat/chat-message-list.tsx";
import { ChatThreadList } from "@/components/chat/chat-thread-list.tsx";
import { COPY } from "@/lib/copy-constants.ts";
import { useChatThread, useChatThreadChat } from "@/hooks/use-chat-thread.ts";

export function ChatPanelBody(): React.JSX.Element {
  const [draft, setDraft] = useState("");
  const [showStoppedMarker, setShowStoppedMarker] = useState(false);
  const { threadId, setThreadId, createThread, threads } = useChatThread();
  const { chat, threadQuery, streaming, sendMessage } = useChatThreadChat(threadId);

  const sendCurrent = useCallback((): void => {
    setShowStoppedMarker(false);
    sendMessage(draft);
    setDraft("");
  }, [draft, sendMessage]);

  const showEmpty = chat.messages.length === 0 && !threadQuery.isLoading;

  return (
    <>
      <ChatThreadList
        threads={threads.data?.threads ?? []}
        threadId={threadId}
        onSelect={setThreadId}
        onCreate={() => {
          void createThread.mutate();
        }}
      />
      {threadQuery.isError ? (
        <p className="px-3 py-2 text-xs text-destructive">{COPY.chat.schemaDrift}</p>
      ) : null}
      {showEmpty ? <ChatEmptyState onPickPrompt={setDraft} /> : null}
      <ChatMessages
        messages={chat.messages}
        streaming={streaming}
        showStoppedMarker={showStoppedMarker}
        onRegenerate={() => chat.regenerate()}
      />
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
    </>
  );
}
