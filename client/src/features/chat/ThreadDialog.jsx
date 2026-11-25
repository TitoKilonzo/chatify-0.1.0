import { useEffect, useMemo, useState } from 'react';
import { Send } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { formatMessageTime } from '../../lib/date.js';
import { selectConversation, useMessageStore } from '../../stores/messageStore.js';
import { AttachmentView } from './AttachmentView.jsx';
import { loadThread, sendMessage } from './messageActions.js';
import styles from './ThreadDialog.module.css';

/** A group thread: the original message with its replies, and a box to add to it. */
export function ThreadDialog({ root, conversationId, meId, names, onClose }) {
  const state = useMessageStore(selectConversation(conversationId));
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const rootId = root?.id;

  useEffect(() => {
    if (typeof rootId === 'number') {
      loadThread(rootId)
        .then(() => setError(null))
        .catch((err) => setError(err.message));
    }
  }, [rootId]);

  // Read the root from the store so its latest edits and reply count show here too.
  const current = useMemo(
    () => state.messages.find((message) => message.id === rootId) ?? root,
    [state.messages, rootId, root],
  );
  const replies = useMemo(
    () => state.messages.filter((message) => message.threadRootId === rootId),
    [state.messages, rootId],
  );

  function submit(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body) {
      return;
    }
    sendMessage({ conversationId, senderId: meId, body, threadRootId: rootId });
    setText('');
  }

  return (
    <Dialog open={Boolean(root)} onClose={onClose} title="Thread" size="md">
      {current ? (
        <div className={styles.thread}>
          <Entry message={current} meId={meId} names={names} highlight />
          {error ? <Alert>{error}</Alert> : null}
          <ol className={styles.replies} aria-label="Replies" aria-live="polite">
            {replies.map((message) => (
              <li key={message.clientId}>
                <Entry message={message} meId={meId} names={names} />
              </li>
            ))}
          </ol>
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor="thread-reply" className="visually-hidden">
              Reply in thread
            </label>
            <textarea
              id="thread-reply"
              className={styles.field}
              rows={2}
              maxLength={4000}
              placeholder="Reply in thread"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit(event);
                }
              }}
            />
            <IconButton
              label="Send reply"
              icon={Send}
              variant="primary"
              type="submit"
              disabled={!text.trim()}
            />
          </form>
        </div>
      ) : null}
    </Dialog>
  );
}

function Entry({ message, meId, names, highlight = false }) {
  const deleted = Boolean(message.deletedAt);
  return (
    <article className={highlight ? styles.rootEntry : styles.entry}>
      <p className={styles.who}>
        {message.senderId === meId ? 'You' : (names[message.senderId] ?? 'Former member')}
        <time className={styles.time} dateTime={new Date(message.createdAt).toISOString()}>
          {formatMessageTime(message.createdAt)}
        </time>
      </p>
      {deleted ? (
        <p className={styles.deleted}>This message was deleted</p>
      ) : (
        <>
          {message.attachment ? <AttachmentView attachment={message.attachment} /> : null}
          {message.body ? <p className={styles.text}>{message.body}</p> : null}
        </>
      )}
      {message.failed ? <p className={styles.deleted}>Not sent</p> : null}
    </article>
  );
}
