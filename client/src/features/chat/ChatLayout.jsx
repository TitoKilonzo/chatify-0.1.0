import { useMemo, useRef } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { ErrorBoundary } from '../../components/ErrorBoundary.jsx';
import { filterConversations, sortConversations } from '../../lib/conversation-cache.js';
import { useSession } from '../auth/useSession.js';
import { ConversationList } from './ConversationList.jsx';
import { useConversationsQuery } from './useConversations.js';
import { useShortcuts } from './useShortcuts.js';
import styles from './ChatLayout.module.css';

/**
 * Two-column chat area (list and pane) inside the app shell, which supplies the rail. On narrow
 * screens only one column shows at a time: the list at /chats, the pane at /chats/:id.
 */
export function ChatLayout({ scope }) {
  const section = scope === 'groups' ? 'groups' : 'chats';
  const match = useMatch(`/${section}/:conversationId`);
  const conversationId = match?.params.conversationId;
  const { data: me } = useSession();
  const searchRef = useRef(null);
  const { data } = useConversationsQuery();

  const ordered = useMemo(
    () => filterConversations(sortConversations(data ?? []), { scope }),
    [data, scope],
  );
  useShortcuts({ section, activeId: conversationId, conversations: ordered, searchRef });

  return (
    <div className={styles.layout} data-view={conversationId ? 'pane' : 'list'}>
      <aside className={styles.list}>
        <ConversationList scope={scope} meId={me.id} searchRef={searchRef} />
      </aside>
      <section className={styles.pane}>
        <ErrorBoundary resetKey={conversationId}>
          <Outlet context={{ section }} />
        </ErrorBoundary>
      </section>
    </div>
  );
}
