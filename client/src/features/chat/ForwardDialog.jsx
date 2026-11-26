import { useMemo, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { sortConversations, conversationTitle } from '../../lib/conversation-cache.js';
import { forwardMessage } from './messageActions.js';
import { useConversationsQuery } from './useConversations.js';
import { Dialog } from '../../components/ui/Dialog.jsx';
import styles from './MessageDialogs.module.css';

const MAX_TARGETS = 5;

/** Pick up to five conversations and send a copy of a message to each. */
export function ForwardDialog({ message, onClose }) {
  const query = useConversationsQuery();
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const conversations = useMemo(
    () =>
      sortConversations(
        (query.data ?? []).filter((c) => !c.archived && !(c.channel && c.role === 'member')),
      ),
    [query.data],
  );

  function toggle(id) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < MAX_TARGETS
          ? [...current, id]
          : current,
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await forwardMessage(message.id, selected);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={Boolean(message)}
      onClose={onClose}
      title="Forward message"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={busy}
            disabled={selected.length === 0}
            onClick={submit}
          >
            Forward{selected.length > 0 ? ` (${selected.length})` : ''}
          </Button>
        </>
      }
    >
      <div className={styles.stack}>
        <p className={styles.note}>Choose up to {MAX_TARGETS} conversations.</p>
        {error ? <Alert>{error}</Alert> : null}
        {conversations.length === 0 ? (
          <p className={styles.note}>You have no other conversations yet.</p>
        ) : (
          <ul className={styles.list}>
            {conversations.map((conversation) => {
              const checked = selected.includes(conversation.id);
              return (
                <li key={conversation.id}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && selected.length >= MAX_TARGETS}
                      onChange={() => toggle(conversation.id)}
                    />
                    <span>{conversationTitle(conversation)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
