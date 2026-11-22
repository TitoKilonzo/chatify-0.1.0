import { NavLink } from 'react-router-dom';
import { Archive, ArchiveRestore, Bell, BellOff, Ellipsis } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { Menu } from '../../components/ui/Menu.jsx';
import { conversationTitle, previewText } from '../../lib/conversation-cache.js';
import { cx } from '../../lib/cx.js';
import { formatListTime } from '../../lib/date.js';
import { effectivePresence, usePresenceStore, useTypingStore } from '../../stores/liveStores.js';
import { useSetPreferences } from './useConversations.js';
import styles from './ConversationListItem.module.css';

export function ConversationListItem({ conversation, section, meId }) {
  const setPreferences = useSetPreferences();
  const live = usePresenceStore((state) => state.byUser);
  const typingIds = useTypingStore((state) => state.byConversation[conversation.id]);
  const isGroup = conversation.type === 'group';
  const title = conversationTitle(conversation);
  const presence = effectivePresence(conversation.counterpart, live);
  const typing = (typingIds ?? []).length > 0;
  const unread = conversation.unreadCount;

  const menuItems = [
    {
      id: 'archive',
      label: conversation.archived ? 'Unarchive' : 'Archive',
      icon: conversation.archived ? ArchiveRestore : Archive,
      onSelect: () =>
        setPreferences.mutate({ id: conversation.id, archived: !conversation.archived }),
    },
    {
      id: 'mute',
      label: conversation.muted ? 'Unmute' : 'Mute',
      icon: conversation.muted ? Bell : BellOff,
      onSelect: () => setPreferences.mutate({ id: conversation.id, muted: !conversation.muted }),
    },
  ];

  return (
    <li className={styles.item}>
      <NavLink
        to={`/${section}/${conversation.id}`}
        className={({ isActive }) => cx(styles.link, isActive && styles.active)}
      >
        <Avatar
          name={title}
          src={isGroup ? conversation.avatarUrl : conversation.counterpart?.avatarUrl}
          kind={isGroup ? 'group' : 'user'}
          status={isGroup ? undefined : presence.status}
          decorative
        />
        <span className={styles.body}>
          <span className={styles.top}>
            <span className={cx(styles.title, unread > 0 && styles.unreadTitle)}>{title}</span>
            <time
              className={styles.time}
              dateTime={new Date(conversation.lastMessageAt).toISOString()}
            >
              {formatListTime(conversation.lastMessageAt)}
            </time>
          </span>
          <span className={styles.bottom}>
            <span className={cx(styles.preview, typing && styles.typing)}>
              {typing ? 'typing...' : previewText(conversation, meId)}
            </span>
            {conversation.muted ? (
              <BellOff size={14} className={styles.muted} aria-label="Muted" role="img" />
            ) : null}
            <Badge count={unread} />
          </span>
        </span>
      </NavLink>
      <div className={styles.actions}>
        <Menu
          label={`Actions for ${title}`}
          items={menuItems}
          placement="bottom-end"
          trigger={(props) => (
            <IconButton label={`Actions for ${title}`} icon={Ellipsis} size="sm" {...props} />
          )}
        />
      </div>
    </li>
  );
}
