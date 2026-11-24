import { useQuery } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { api } from '../../lib/api.js';
import { formatDayLabel } from '../../lib/date.js';
import styles from './MessageDialogs.module.css';

/** Pinned messages for one conversation. Choosing one jumps to it in the history. */
export function PinsDialog({ open, onClose, conversationId, names, onSelect }) {
  const pins = useQuery({
    queryKey: ['pins', conversationId],
    queryFn: () => api.get(`/conversations/${conversationId}/pins`),
    enabled: open,
    staleTime: 0,
  });

  return (
    <Dialog open={open} onClose={onClose} title="Pinned messages" size="sm">
      {pins.isPending ? (
        <p className={styles.note}>Loading...</p>
      ) : pins.isError ? (
        <Alert>{pins.error.message}</Alert>
      ) : pins.data.messages.length === 0 ? (
        <p className={styles.note}>Nothing is pinned yet. Use the message menu to pin one.</p>
      ) : (
        <ul className={styles.list}>
          {pins.data.messages.map((message) => (
            <li key={message.id}>
              <button type="button" className={styles.option} onClick={() => onSelect(message.id)}>
                <span className={styles.text}>
                  <span className={styles.title}>{names[message.senderId] ?? 'Former member'}</span>
                  <span className={styles.snippet}>
                    {message.body || `Attachment (${message.attachment?.kind ?? 'file'})`}
                  </span>
                  <span className={styles.when}>{formatDayLabel(message.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
