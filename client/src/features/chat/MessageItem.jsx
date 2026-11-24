import { memo, useState } from 'react';
import {
  Copy,
  Ellipsis,
  Forward,
  Pencil,
  Pin,
  PinOff,
  Reply,
  RotateCcw,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { IconButton } from '../../components/ui/IconButton.jsx';
import { Menu } from '../../components/ui/Menu.jsx';
import { cx } from '../../lib/cx.js';
import { formatDayLabel, formatMessageTime } from '../../lib/date.js';
import { attachmentLabel } from '../../lib/format.js';
import { AttachmentView } from './AttachmentView.jsx';
import { useReplyStore } from '../../stores/liveStores.js';
import {
  clearReaction,
  deleteMessage,
  discardFailed,
  editMessage,
  reactToMessage,
  retryMessage,
  setPinned,
} from './messageActions.js';
import { REACTIONS, REACTION_BY_KEY } from './reactions.js';
import { ReceiptTicks } from './ReceiptTicks.jsx';
import styles from './MessageItem.module.css';

const MAX_BODY = 4000;

function MessageItemBase({
  message,
  own,
  meId,
  showDay,
  continued,
  senderName,
  isGroup,
  names,
  canPin,
  highlighted,
  onForward,
  onJumpTo,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const setReply = useReplyStore((state) => state.setReply);
  const deleted = Boolean(message.deletedAt);
  const settled = !message.pending && !deleted;
  const myReaction = message.reactions?.find((r) => r.userIds.includes(meId))?.key ?? null;

  async function run(action) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    }
  }

  function react(key) {
    setPicking(false);
    run(() => (key === myReaction ? clearReaction(message.id) : reactToMessage(message.id, key)));
  }

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
    {
      id: 'reply',
      label: 'Reply',
      icon: Reply,
      onSelect: () => setReply(message.conversationId, message),
    },
    { id: 'react', label: 'React', icon: SmilePlus, onSelect: () => setPicking(true) },
    { id: 'forward', label: 'Forward', icon: Forward, onSelect: () => onForward?.(message) },
    canPin
      ? {
          id: 'pin',
          label: message.pinnedAt ? 'Unpin' : 'Pin',
          icon: message.pinnedAt ? PinOff : Pin,
          onSelect: () => run(() => setPinned(message.id, !message.pinnedAt)),
        }
      : null,
    message.body
      ? {
          id: 'copy',
          label: 'Copy text',
          icon: Copy,
          onSelect: () => navigator.clipboard?.writeText(message.body),
        }
      : null,
    own ? { id: 'edit', label: 'Edit', icon: Pencil, onSelect: startEdit } : null,
    own
      ? { id: 'delete', label: 'Delete', icon: Trash2, onSelect: () => setConfirmingDelete(true) }
      : null,
  ].filter(Boolean);

  return (
    <div
      id={typeof message.id === 'number' ? `message-${message.id}` : undefined}
      className={cx(
        styles.row,
        own && styles.own,
        continued && styles.continued,
        highlighted && styles.highlighted,
      )}
    >
      {showDay ? (
        <div className={styles.day}>
          <span>{formatDayLabel(message.createdAt)}</span>
        </div>
      ) : null}

      <div className={styles.line}>
        {settled && !editing ? (
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

          {!deleted && message.forwarded ? (
            <p className={styles.forwarded}>
              <Forward size={12} aria-hidden="true" />
              Forwarded
            </p>
          ) : null}
          {!deleted && message.pinnedAt ? (
            <p className={styles.forwarded}>
              <Pin size={12} aria-hidden="true" />
              Pinned
            </p>
          ) : null}
          {!deleted && message.replyTo ? (
            <button
              type="button"
              className={styles.quote}
              onClick={() => onJumpTo?.(message.replyTo.id)}
              aria-label="Go to the original message"
            >
              <span className={styles.quoteName}>
                {message.replyTo.senderId === meId
                  ? 'You'
                  : (names?.[message.replyTo.senderId] ?? 'Former member')}
              </span>
              <span className={styles.quoteText}>
                {message.replyTo.deleted
                  ? 'This message was deleted'
                  : message.replyTo.body || attachmentLabel(message.replyTo.attachmentKind)}
              </span>
            </button>
          ) : null}

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

          {!deleted && message.reactions?.length > 0 ? (
            <ul className={styles.reactions} aria-label="Reactions">
              {message.reactions.map((reaction) => {
                const spec = REACTION_BY_KEY[reaction.key];
                if (!spec) {
                  return null;
                }
                const Icon = spec.icon;
                const mine = reaction.userIds.includes(meId);
                return (
                  <li key={reaction.key}>
                    <button
                      type="button"
                      className={cx(styles.reaction, mine && styles.reactionMine)}
                      aria-pressed={mine}
                      aria-label={`${spec.label}, ${reaction.userIds.length}`}
                      onClick={() => react(reaction.key)}
                    >
                      <Icon size={12} aria-hidden="true" />
                      <span>{reaction.userIds.length}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <p className={styles.meta}>
            {message.editedAt && !deleted ? <span>edited</span> : null}
            <time dateTime={new Date(message.createdAt).toISOString()}>
              {formatMessageTime(message.createdAt)}
            </time>
            {own && !deleted ? <ReceiptTicks message={message} /> : null}
          </p>
        </article>
      </div>

      {picking ? (
        <div className={styles.picker} role="group" aria-label="Choose a reaction">
          {REACTIONS.map(({ key, icon: Icon, label }) => (
            <IconButton key={key} label={label} icon={Icon} size="sm" onClick={() => react(key)} />
          ))}
          <IconButton label="Close" icon={X} size="sm" onClick={() => setPicking(false)} />
        </div>
      ) : null}

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
