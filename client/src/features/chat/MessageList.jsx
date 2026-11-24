import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import { continuesRun, startsNewDay } from '../../lib/message-cache.js';
import { START_INDEX } from '../../stores/messageStore.js';
import { loadOlder } from './messageActions.js';
import { MessageItem } from './MessageItem.jsx';
import styles from './MessageList.module.css';

const BOTTOM_THRESHOLD_PX = 120;

/**
 * Virtualized message history. Older pages load when the top is reached and are prepended without
 * moving the viewport (firstItemIndex). New messages follow the bottom only when the reader is
 * already there; otherwise a "new messages" button appears.
 */
export function MessageList({
  conversationId,
  messages,
  prependCount,
  loadingOlder,
  meId,
  isGroup,
  names,
  canPin,
  highlightId,
  onForward,
  onJumpTo,
  ref,
}) {
  const virtuoso = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  // clientId of the newest message at the moment the reader scrolled away from the bottom.
  const [anchor, setAnchor] = useState(null);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useImperativeHandle(ref, () => ({
    scrollToMessage: (messageId) => {
      const index = messagesRef.current.findIndex((message) => message.id === messageId);
      if (index === -1) {
        return false;
      }
      virtuoso.current?.scrollToIndex({ index, align: 'center', behavior: 'auto' });
      return true;
    },
    scrollToBottom: () =>
      virtuoso.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' }),
  }));

  function onBottomChange(bottom) {
    setAtBottom(bottom);
    if (!bottom) {
      setAnchor(messagesRef.current[messagesRef.current.length - 1]?.clientId ?? null);
    }
  }

  // Arrivals from others since the reader scrolled up.
  const anchorIndex = messages.findIndex((message) => message.clientId === anchor);
  const unseen =
    atBottom || anchorIndex === -1
      ? 0
      : messages.slice(anchorIndex + 1).filter((message) => message.senderId !== meId).length;

  const firstItemIndex = START_INDEX - prependCount;

  return (
    <div className={styles.wrapper}>
      <Virtuoso
        ref={virtuoso}
        className={styles.list}
        data={messages}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
        atBottomThreshold={BOTTOM_THRESHOLD_PX}
        atBottomStateChange={onBottomChange}
        followOutput={(bottom) => (bottom ? 'smooth' : false)}
        startReached={() => loadOlder(conversationId)}
        computeItemKey={(_index, message) => message.clientId}
        components={{
          Header: () => (
            <div className={styles.header} aria-live="polite">
              {loadingOlder ? (
                <span className={styles.loadingOlder}>
                  <LoaderCircle size={16} className={styles.spinner} aria-hidden="true" />
                  Loading earlier messages
                </span>
              ) : null}
            </div>
          ),
          Footer: () => <div className={styles.footer} />,
        }}
        itemContent={(index, message) => {
          const position = index - firstItemIndex;
          return (
            <MessageItem
              message={message}
              own={message.senderId === meId}
              meId={meId}
              names={names}
              canPin={canPin}
              highlighted={highlightId === message.id}
              onForward={onForward}
              onJumpTo={onJumpTo}
              showDay={startsNewDay(messages, position)}
              continued={continuesRun(messages, position)}
              senderName={names[message.senderId] ?? 'Former member'}
              isGroup={isGroup}
            />
          );
        }}
        role="log"
        aria-label="Messages"
      />

      {!atBottom ? (
        <button
          type="button"
          className={styles.jump}
          onClick={() =>
            virtuoso.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
          }
        >
          <ChevronDown size={16} aria-hidden="true" />
          <span>{unseen > 0 ? `${unseen} new message${unseen === 1 ? '' : 's'}` : 'Latest'}</span>
        </button>
      ) : null}
    </div>
  );
}
