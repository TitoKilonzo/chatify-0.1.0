import { useMemo, useRef, useState } from 'react';
import {
  Compass,
  Megaphone,
  MessageSquarePlus,
  Plus,
  Search,
  TextSearch,
  Users,
} from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Menu } from '../../components/ui/Menu.jsx';
import { filterConversations, sortConversations } from '../../lib/conversation-cache.js';
import { cx } from '../../lib/cx.js';
import { ConversationListItem } from './ConversationListItem.jsx';
import { MessageSearchDialog } from './MessageSearchDialog.jsx';
import { NewChatDialog } from './NewChatDialog.jsx';
import { DiscoverChannelsDialog } from './DiscoverChannelsDialog.jsx';
import { NewChannelDialog } from './NewChannelDialog.jsx';
import { NewGroupDialog } from './NewGroupDialog.jsx';
import { useConversationsQuery } from './useConversations.js';
import styles from './ConversationList.module.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'archived', label: 'Archived' },
];

const EMPTY_TEXT = {
  all: 'No conversations yet. Start one with the plus button.',
  unread: 'Nothing unread. You are all caught up.',
  archived: 'No archived conversations.',
};

export function ConversationList({ scope, meId, searchRef }) {
  const query = useConversationsQuery();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const fallbackRef = useRef(null);
  const section = scope === 'groups' ? 'groups' : 'chats';

  const visible = useMemo(
    () =>
      filterConversations(sortConversations(query.data ?? []), { scope, filter, query: search }),
    [query.data, scope, filter, search],
  );

  const menuItems = [
    {
      id: 'direct',
      label: 'New message',
      icon: MessageSquarePlus,
      onSelect: () => setDialog('chat'),
    },
    { id: 'group', label: 'New group', icon: Users, onSelect: () => setDialog('group') },
    { id: 'channel', label: 'New channel', icon: Megaphone, onSelect: () => setDialog('channel') },
    {
      id: 'discover',
      label: 'Find channels',
      icon: Compass,
      onSelect: () => setDialog('discover'),
    },
  ];

  return (
    <div className={styles.list}>
      <header className={styles.header}>
        <h1 className={styles.title}>{scope === 'groups' ? 'Groups' : 'Chats'}</h1>
        <IconButton
          label="Search messages"
          icon={TextSearch}
          onClick={() => setDialog('messages')}
        />
        <Menu
          label="Start a conversation"
          items={menuItems}
          placement="bottom-end"
          trigger={(props) => (
            <IconButton label="Start a conversation" icon={Plus} variant="primary" {...props} />
          )}
        />
      </header>

      <div className={styles.search}>
        <Input
          ref={searchRef ?? fallbackRef}
          label="Search conversations"
          hideLabel
          leadingIcon={Search}
          placeholder="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoComplete="off"
        />
      </div>

      <div className={styles.filters} role="group" aria-label="Filter conversations">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cx(styles.filter, filter === item.id && styles.filterActive)}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <nav className={styles.scroll} aria-label={scope === 'groups' ? 'Groups' : 'Conversations'}>
        {query.isPending ? (
          <ul className={styles.skeletons} aria-busy="true" aria-label="Loading conversations">
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className={styles.skeleton} aria-hidden="true" />
            ))}
          </ul>
        ) : query.isError ? (
          <div className={styles.state}>
            <Alert>{query.error.message}</Alert>
            <Button onClick={() => query.refetch()}>Try again</Button>
          </div>
        ) : visible.length === 0 ? (
          <p className={styles.state}>
            {search.trim() ? 'No conversations match your search.' : EMPTY_TEXT[filter]}
          </p>
        ) : (
          <ul className={styles.items}>
            {visible.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                section={section}
                meId={meId}
              />
            ))}
          </ul>
        )}
      </nav>

      <MessageSearchDialog open={dialog === 'messages'} onClose={() => setDialog(null)} />
      <NewChatDialog open={dialog === 'chat'} onClose={() => setDialog(null)} />
      <NewGroupDialog open={dialog === 'group'} onClose={() => setDialog(null)} />
      <NewChannelDialog open={dialog === 'channel'} onClose={() => setDialog(null)} />
      <DiscoverChannelsDialog open={dialog === 'discover'} onClose={() => setDialog(null)} />
    </div>
  );
}
