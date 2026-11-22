import { MessageSquare } from 'lucide-react';
import styles from './EmptyPane.module.css';

/** Shown in the conversation pane when no conversation is open. */
export function EmptyPane() {
  return (
    <div className={styles.pane}>
      <MessageSquare size={32} aria-hidden="true" />
      <h2 className={styles.title}>No conversation selected</h2>
      <p className={styles.text}>Choose a conversation from the list, or start a new one.</p>
    </div>
  );
}
