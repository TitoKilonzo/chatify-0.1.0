import { Check, CheckCheck, CircleAlert, Clock } from 'lucide-react';
import { countAtLeast, messageStatus } from '../../lib/message-cache.js';
import styles from './ReceiptTicks.module.css';

const LABELS = {
  sending: 'Sending',
  failed: 'Not sent',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

/**
 * Delivery state of the sender's own message. Meaning is in the icon shape and the text label,
 * never in colour alone: one tick sent, two ticks delivered, two bold ticks read.
 */
export function ReceiptTicks({ message }) {
  const status = messageStatus(message);
  const total = message.receipts.length;
  let label = LABELS[status];
  if (total > 1 && (status === 'sent' || status === 'delivered')) {
    label = `${LABELS[status]} (read by ${countAtLeast(message, 'read')} of ${total})`;
  }

  const Icon =
    status === 'sending'
      ? Clock
      : status === 'failed'
        ? CircleAlert
        : status === 'sent'
          ? Check
          : CheckCheck;

  return (
    <span className={styles.ticks} data-status={status} title={label}>
      <Icon size={14} aria-hidden="true" strokeWidth={status === 'read' ? 3 : 2} />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
