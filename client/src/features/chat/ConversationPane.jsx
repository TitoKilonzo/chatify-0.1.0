import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Info, Paperclip } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { ApiError } from '../../lib/api.js';
import { conversationTitle } from '../../lib/conversation-cache.js';
import { formatLastSeen } from '../../lib/date.js';
import { selectConversation, useMessageStore } from '../../stores/messageStore.js';
import { effectivePresence, usePresenceStore, useTypingStore } from '../../stores/liveStores.js';
import { useSession } from '../auth/useSession.js';
import { Composer } from './Composer.jsx';
import { ConversationInfoDialog } from './ConversationInfoDialog.jsx';
import { loadLatest, markRead } from './messageActions.js';
import { MessageList } from './MessageList.jsx';
import { useConversationDetail } from './useConversations.js';
import { isViewing, setViewing } from './viewing.js';
import styles from './ConversationPane.module.css';

export function ConversationPane() {
  const { conversationId } = useParams();
  const { section } = useOutletContext();
  const { data: me } = useSession();
  const detail = useConversationDetail(conversationId);

  if (detail.isError) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div className={styles.unavailable}>
        <Alert>{missing ? 'This conversation is not available.' : detail.error.message}</Alert>
        {missing ? null : <Button onClick={() => detail.refetch()}>Try again</Button>}
        <Link to={`/${section}`} className={styles.backLink}>
          Back to conversations
        </Link>
      </div>
    );
  }
  if (!detail.data) {
    return <div className={styles.loading} aria-busy="true" aria-label="Loading conversation" />;
  }
  // Keyed so every conversation starts with fresh scroll, composer, and upload state.
  return (
    <OpenConversation
      key={conversationId}
      conversation={detail.data}
      meId={me.id}
      section={section}
    />
  );
}

function OpenConversation({ conversation, meId, section }) {
  const navigate = useNavigate();
  const conversationId = conversation.id;
  const state = useMessageStore(selectConversation(conversationId));
  const listRef = useRef(null);
  const composerRef = useRef(null);
  const [showInfo, setShowInfo] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const isGroup = conversation.type === 'group';

  // Names for message senders and the typing line, from the member list or the counterpart.
  const names = useMemo(() => {
    const map = {};
    if (isGroup) {
      conversation.members.forEach((member) => {
        map[member.id] = member.displayName;
      });
    } else if (conversation.counterpart) {
      map[conversation.counterpart.id] = conversation.counterpart.displayName;
    }
    return map;
  }, [conversation, isGroup]);

  useEffect(() => {
    setViewing(conversationId);
    loadLatest(conversationId);
    return () => setViewing(null);
  }, [conversationId]);

  // Mark everything up to the newest incoming message as read while the chat is on screen.
  const latestIncoming = useMemo(() => {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index];
      if (message.senderId !== meId && typeof message.id === 'number') {
        return message.id;
      }
    }
    return null;
  }, [state.messages, meId]);

  const markIfVisible = useCallback(() => {
    if (latestIncoming !== null && isViewing(conversationId)) {
      markRead(conversationId, latestIncoming);
    }
  }, [conversationId, latestIncoming]);

  useEffect(() => {
    markIfVisible();
    window.addEventListener('focus', markIfVisible);
    document.addEventListener('visibilitychange', markIfVisible);
    return () => {
      window.removeEventListener('focus', markIfVisible);
      document.removeEventListener('visibilitychange', markIfVisible);
    };
  }, [markIfVisible]);

  function onDragEnter(event) {
    if (event.dataTransfer?.types?.includes('Files')) {
      dragDepth.current += 1;
      setDragging(true);
    }
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragging(false);
    }
  }
  function onDrop(event) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      composerRef.current?.addFile(file);
    }
  }

  return (
    // The drop target is a progressive enhancement: the attach button is the accessible path.
    <div
      className={styles.pane}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <Header
        conversation={conversation}
        names={names}
        onBack={() => navigate(`/${section}`)}
        onInfo={() => setShowInfo(true)}
      />

      <div className={styles.body}>
        {!state.loaded && state.error ? (
          <div className={styles.status}>
            <Alert>{state.error.message}</Alert>
            <Button onClick={() => loadLatest(conversationId)}>Try again</Button>
          </div>
        ) : !state.loaded ? (
          <div className={styles.status} aria-busy="true">
            <p className={styles.muted}>Loading messages...</p>
          </div>
        ) : state.messages.length === 0 ? (
          <div className={styles.status}>
            <p className={styles.muted}>No messages yet. Say hello.</p>
          </div>
        ) : (
          <MessageList
            ref={listRef}
            conversationId={conversationId}
            messages={state.messages}
            prependCount={state.prependCount}
            loadingOlder={state.loading}
            meId={meId}
            isGroup={isGroup}
            names={names}
          />
        )}
        {dragging ? (
          <div className={styles.drop} aria-hidden="true">
            <Paperclip size={24} />
            <span>Drop a file to attach it</span>
          </div>
        ) : null}
      </div>

      <Composer
        ref={composerRef}
        conversationId={conversationId}
        meId={meId}
        onSent={() => listRef.current?.scrollToBottom()}
      />

      <ConversationInfoDialog
        open={showInfo}
        onClose={() => setShowInfo(false)}
        conversation={conversation}
        meId={meId}
        section={section}
      />
    </div>
  );
}

function Header({ conversation, names, onBack, onInfo }) {
  const live = usePresenceStore((state) => state.byUser);
  const typingIds = useTypingStore((state) => state.byConversation[conversation.id]);
  const isGroup = conversation.type === 'group';
  const title = conversationTitle(conversation);
  const presence = effectivePresence(conversation.counterpart, live);

  const typingNames = (typingIds ?? []).map((id) => names[id]).filter(Boolean);
  let subtitle;
  if (typingNames.length > 0) {
    subtitle = isGroup
      ? `${typingNames.slice(0, 2).join(' and ')} ${typingNames.length > 1 ? 'are' : 'is'} typing...`
      : 'typing...';
  } else if (isGroup) {
    subtitle = `${conversation.memberCount} members`;
  } else {
    subtitle = presence.status === 'online' ? 'Online' : formatLastSeen(presence.lastSeenAt);
  }

  return (
    <header className={styles.header}>
      <span className={styles.back}>
        <IconButton label="Back to conversations" icon={ArrowLeft} onClick={onBack} />
      </span>
      <Avatar
        name={title}
        src={isGroup ? conversation.avatarUrl : conversation.counterpart?.avatarUrl}
        kind={isGroup ? 'group' : 'user'}
        status={isGroup ? undefined : presence.status}
        decorative
      />
      <div className={styles.titles}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle} aria-live="polite">
          {subtitle}
        </p>
      </div>
      <IconButton label="Conversation details" icon={Info} onClick={onInfo} />
    </header>
  );
}
