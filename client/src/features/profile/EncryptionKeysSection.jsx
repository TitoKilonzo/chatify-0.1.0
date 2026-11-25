import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import {
  backUpKey,
  createKey,
  refreshKeyStatus,
  removeBackup,
  restoreKey,
  useKeyStatus,
} from '../../lib/e2eeSession.js';
import styles from './Settings.module.css';

const MIN_PASSPHRASE = 10;

const STATE_TEXT = {
  none: 'You have no encryption key yet.',
  ready: 'This device holds your encryption key.',
  mismatch:
    'Your account has an encryption key, but this device does not hold it. Restore it from your backup, or create a new key (old encrypted messages then cannot be read).',
};

/** Create, back up and restore the key used for end-to-end encrypted chats. */
export function EncryptionKeysSection({ userId }) {
  const { loaded, state, hasBackup } = useKeyStatus();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    refreshKeyStatus(userId).catch(() => {});
  }, [userId]);

  async function run(name, action, message) {
    setBusy(name);
    setError(null);
    setDone(null);
    try {
      await action();
      setPassphrase('');
      setDone(message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const tooShort = passphrase.length < MIN_PASSPHRASE;

  return (
    <section className={styles.section} aria-labelledby="keys-heading">
      <h2 id="keys-heading" className={styles.heading}>
        Encryption key
      </h2>
      <p className={styles.note}>
        Used for end-to-end encrypted chats. The key stays on this device. A backup is locked with a
        passphrase that only you know, so we cannot read it and cannot recover it if you forget the
        passphrase.
      </p>
      {loaded ? <p>{STATE_TEXT[state]}</p> : null}
      {state !== 'none' ? (
        <p>{hasBackup ? 'A backup is stored.' : 'No backup is stored.'}</p>
      ) : null}

      {state === 'none' || state === 'mismatch' ? (
        <div>
          <Button
            variant="secondary"
            leadingIcon={KeyRound}
            loading={busy === 'create'}
            onClick={() =>
              run('create', () => createKey(userId), 'A new encryption key was created.')
            }
          >
            Create a new key
          </Button>
        </div>
      ) : null}

      {state !== 'none' ? (
        <PasswordInput
          label="Backup passphrase"
          value={passphrase}
          autoComplete="off"
          hint={`At least ${MIN_PASSPHRASE} characters.`}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      ) : null}

      {state === 'ready' ? (
        <div>
          <Button
            variant="secondary"
            loading={busy === 'backup'}
            disabled={tooShort}
            onClick={() =>
              run('backup', () => backUpKey(userId, passphrase), 'Your key is backed up.')
            }
          >
            {hasBackup ? 'Replace backup' : 'Back up key'}
          </Button>
        </div>
      ) : null}

      {state === 'mismatch' && hasBackup ? (
        <div>
          <Button
            variant="secondary"
            loading={busy === 'restore'}
            disabled={tooShort}
            onClick={() =>
              run('restore', () => restoreKey(userId, passphrase), 'Your key was restored.')
            }
          >
            Restore from backup
          </Button>
        </div>
      ) : null}

      {hasBackup ? (
        <div>
          <Button
            variant="ghost"
            loading={busy === 'remove'}
            onClick={() => run('remove', () => removeBackup(userId), 'The backup was removed.')}
          >
            Remove backup
          </Button>
        </div>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}
      {done ? (
        <p role="status" className={styles.note}>
          {done}
        </p>
      ) : null}
    </section>
  );
}
