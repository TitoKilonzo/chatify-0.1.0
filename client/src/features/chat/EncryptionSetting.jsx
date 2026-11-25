import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useEffect, useState } from 'react';
import { safetyNumber } from '../../lib/e2ee.js';
import { useE2ee } from './E2eeContext.jsx';
import { useSetEncryption } from './useConversations.js';
import styles from './ConversationInfoDialog.module.css';

const MESSAGES = {
  SELF_NO_KEY: 'Create an encryption key in Settings first.',
  PEER_NO_KEY: 'The other person has not created an encryption key yet.',
};

/** Turn end-to-end encryption on or off for a direct chat and show the safety number. */
export function EncryptionSetting({ conversation }) {
  const mutation = useSetEncryption(conversation.id);
  const e2ee = useE2ee();
  const [number, setNumber] = useState(null);
  const keys = e2ee.keys;

  useEffect(() => {
    let cancelled = false;
    if (!keys) {
      return undefined;
    }
    safetyNumber(keys.mine, keys.theirs).then((value) => !cancelled && setNumber(value));
    return () => {
      cancelled = true;
    };
  }, [keys]);

  const on = Boolean(conversation.encrypted);
  const code = mutation.error?.code;
  const message = MESSAGES[code] ?? mutation.error?.message;

  return (
    <section className={styles.section} aria-labelledby="encryption-heading">
      <h3 id="encryption-heading" className={styles.sectionTitle}>
        <Lock size={16} aria-hidden="true" /> End-to-end encryption
      </h3>
      <p className={styles.muted}>
        Only the two of you can read new messages. Files, voice notes, search and forwarding are not
        available while it is on. Earlier messages stay as they were.
      </p>
      <div>
        <Button
          variant="secondary"
          loading={mutation.isPending}
          onClick={() => mutation.mutate(!on)}
        >
          {on ? 'Turn encryption off' : 'Turn encryption on'}
        </Button>
      </div>
      {message ? <Alert>{message}</Alert> : null}
      {message && (code === 'SELF_NO_KEY' || code === 'PEER_NO_KEY') ? (
        <p className={styles.muted}>
          {code === 'SELF_NO_KEY' ? <Link to="/settings">Open Settings</Link> : null}
        </p>
      ) : null}
      {number ? (
        <>
          <p className={styles.muted}>
            Safety number. Compare it with the other person in person or on a call. If it differs on
            your two screens, do not trust this chat.
          </p>
          <p>
            <code>{number}</code>
          </p>
        </>
      ) : null}
    </section>
  );
}
