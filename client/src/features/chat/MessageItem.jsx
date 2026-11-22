import { memo, useState } from 'react';
import { Copy, Ellipsis, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { Menu } from '../../components/ui/Menu.jsx';
import { cx } from '../../lib/cx.js';
import { formatDayLabel, formatMessageTime } from '../../lib/date.js';
import { AttachmentView } from './AttachmentView.jsx';
import { deleteMessage, discardFailed, editMessage, retryMessage } from './messageActions.js';
import { ReceiptTicks } from './ReceiptTicks.jsx';
import styles from './MessageItem.module.css';

const MAX_BODY = 4000;

function MessageItemBase({ message, own, showDay, continued, senderName, isGroup }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const deleted = Boolean(message.deletedAt);

  function startEdit() {
    setDraft(message.body);
    setError(null);
    setEditing(true);
  }

  async function saveEdit() {
    const text = draft.trim();
    if (text === message.body) {
      setEditing(false);
      return;
    }
    if (!text && !message.attachment) {
      setError('A message cannot be empty');
      return;
    }
    setBusy(true);
    try {
      await editMessage(message.id, text);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await deleteMessage(message);
      setConfirmingDelete(false);
    } catch (err) {
      setError(err.message);
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const menuItems = [
    message.body
      ? {
          id: 'copy',
          label: 'Copy text',
          icon: Copy,
          onSelect: () => navigator.clipboard?.writeText(message.body),
        }
      : null,
    { id: 'edit', label: 'Edit', icon: Pencil, onSelect: startEdit },
    { id: 'delete', label: 'Delete', icon: Trash2, onSelect: () => setConfirmingDelete(true) },
  ].filter(Boolean);

  return (
    <div className={cx(styles.row, own && styles.own, continued && styles.continued)}>
      {showDay ? (
        <div className={styles.day}>
          <span>{formatDayLabel(message.createdAt)}</span>
        </div>
      ) : null}

      <div className={styles.line}>
        {own && !message.pending && !deleted && !editing ? (
          <div className={styles.menu}>
            <Menu
              label="Message actions"
              items={menuItems}
              placement="bottom-start"
              trigger={(props) => (
                <IconButton label="Message actions" icon={Ellipsis} size="sm" {...props} />
              )}
            />
          </div>
        ) : null}

        <article className={styles.bubble} aria-label={`Message from ${own ? 'you' : senderName}`}>
          {isGroup && !own && !continued ? <p className={styles.sender}>{senderName}</p> : null}

          {deleted ? (
            <p className={styles.deleted}>This message was deleted</p>
          ) : editing ? (
            <div className={styles.edit}>
              <textarea
                className={styles.editField}
                value={draft}
                maxLength={MAX_BODY}
                rows={2}
                aria-label="Edit message"
                // Focus moves into the editor the moment the user chooses Edit.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    saveEdit();
                  } else if (event.key === 'Escape') {
                    setEditing(false);
                  }
                }}
              />
              {error ? (
                <p className={styles.editError} role="alert">
                  {error}
                </p>
              ) : null}
              <div className={styles.editActions}>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="secondary" loading={busy} onClick={saveEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              {message.attachment ? <AttachmentView attachment={message.attachment} /> : null}
              {message.body ? <p className={styles.text}>{message.body}</p> : null}
            </>
          )}

          <p className={styles.meta}>
            {message.editedAt && !deleted ? <span>edited</span> : null}
            <time dateTime={new Date(message.createdAt).toISOString()}>
              {formatMessageTime(message.createdAt)}
            </time>
            {own && !deleted ? <ReceiptTicks message={message} /> : null}
          </p>
        </article>
      </div>

      {message.failed ? (
        <div className={styles.failed} role="alert">
          <span>Message not sent.</span>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={RotateCcw}
            onClick={() => retryMessage(message)}
          >
            Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={() => discardFailed(message)}>
            Discard
          </Button>
        </div>
      ) : null}
      {!editing && error ? (
        <p className={styles.failed} role="alert">
          {error}
        </p>
      ) : null}

      <Dialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete message?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p>This removes the message and any attached file for everyone in the conversation.</p>
      </Dialog>
    </div>
  );
}

export const MessageItem = memo(MessageItemBase);
