import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { useDebounced } from '../../hooks/useDebounced.js';
import { api } from '../../lib/api.js';
import { conversationTitle } from '../../lib/conversation-cache.js';
import { formatDayLabel } from '../../lib/date.js';
import { useConversationsQuery } from './useConversations.js';
import styles from './MessageDialogs.module.css';

const MIN_LENGTH = 2;

/** Search the text of every message in the user's conversations; a result opens at that message. */
export function MessageSearchDialog({ open, onClose }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term.trim());
  const conversations = useConversationsQuery();
  const byId = useMemo(
    () =>
      new Map((conversations.data ?? []).map((conversation) => [conversation.id, conversation])),
    [conversations.data],
  );
  const enabled = open && debounced.length >= MIN_LENGTH;
  const results = useQuery({
    queryKey: ['message-search', debounced],
    queryFn: () => api.get(`/search/messages?q=${encodeURIComponent(debounced)}`),
    enabled,
    staleTime: 15_000,
  });

  function choose(message) {
    const conversation = byId.get(message.conversationId);
    const section = conversation?.type === 'group' ? 'groups' : 'chats';
    onClose();
    navigate(`/${section}/${message.conversationId}?m=${message.threadRootId ?? message.id}`);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Search messages" size="md">
      <div className={styles.stack}>
        <Input
          label="Search all messages"
          leadingIcon={Search}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Words to find"
          autoComplete="off"
          spellCheck={false}
          // The dialog exists only to type a search, so focus goes straight to the field.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <div aria-live="polite" aria-busy={results.isFetching}>
          {term.trim().length < MIN_LENGTH ? (
            <p className={styles.note}>Type at least {MIN_LENGTH} characters.</p>
          ) : results.isError ? (
            <Alert>{results.error.message}</Alert>
          ) : !enabled || results.isPending ? (
            <p className={styles.note}>Searching...</p>
          ) : results.data.messages.length === 0 ? (
            <p className={styles.note}>No messages found.</p>
          ) : (
            <ul className={styles.list}>
              {results.data.messages.map((message) => {
                const conversation = byId.get(message.conversationId);
                return (
                  <li key={message.id}>
                    <button type="button" className={styles.option} onClick={() => choose(message)}>
                      <span className={styles.text}>
                        <span className={styles.title}>
                          {conversation ? conversationTitle(conversation) : 'Conversation'}
                        </span>
                        <span className={styles.snippet}>{message.body}</span>
                        <span className={styles.when}>{formatDayLabel(message.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
