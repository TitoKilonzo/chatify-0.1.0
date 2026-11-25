import { Timer } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { useSetDisappearing } from './useConversations.js';
import styles from './ConversationInfoDialog.module.css';

export const DISAPPEAR_OPTIONS = [
  { seconds: 0, label: 'Off' },
  { seconds: 3600, label: '1 hour' },
  { seconds: 86400, label: '1 day' },
  { seconds: 604800, label: '1 week' },
  { seconds: 2592000, label: '30 days' },
];

export function disappearLabel(seconds) {
  return DISAPPEAR_OPTIONS.find((option) => option.seconds === (seconds ?? 0))?.label ?? 'Custom';
}

/** Choose how long new messages in this conversation last. Older messages are not affected. */
export function DisappearingSetting({ conversation }) {
  const mutation = useSetDisappearing(conversation.id);
  const canChange = conversation.type !== 'group' || conversation.role !== 'member';
  const current = conversation.disappearAfterSeconds ?? 0;

  return (
    <section className={styles.section} aria-labelledby="disappearing-heading">
      <h3 id="disappearing-heading" className={styles.sectionTitle}>
        <Timer size={16} aria-hidden="true" /> Disappearing messages
      </h3>
      <p className={styles.muted}>
        New messages are removed for everyone after this time. Messages already sent are kept.
      </p>
      {canChange ? (
        <div className={styles.toggles} role="group" aria-label="Disappearing messages timer">
          {DISAPPEAR_OPTIONS.map((option) => (
            <button
              key={option.seconds}
              type="button"
              className={styles.choice}
              aria-pressed={current === option.seconds}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(option.seconds)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p>{disappearLabel(current)}. Only group admins can change this.</p>
      )}
      {mutation.isError ? <Alert>{mutation.error.message}</Alert> : null}
    </section>
  );
}
