import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushServerEnabled,
  pushSupported,
} from '../../lib/push.js';
import styles from './Settings.module.css';

/** Turn browser notifications on or off for this device. */
export function NotificationsSection() {
  const [state, setState] = useState({ ready: false, serverOn: false, subscribed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const supported = pushSupported();

  useEffect(() => {
    if (!supported) {
      return undefined;
    }
    let cancelled = false;
    Promise.all([pushServerEnabled().catch(() => false), currentSubscription()])
      .then(([serverOn, subscription]) => {
        if (!cancelled) {
          setState({ ready: true, serverOn, subscribed: Boolean(subscription) });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ ready: true, serverOn: false, subscribed: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (state.subscribed) {
        await disablePush();
        setState((current) => ({ ...current, subscribed: false }));
      } else {
        await enablePush();
        setState((current) => ({ ...current, subscribed: true }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="notifications-heading">
      <h2 id="notifications-heading" className={styles.heading}>
        Notifications
      </h2>
      {!supported ? (
        <p className={styles.note}>
          This browser cannot show notifications. On iPhone and iPad, add Chatify to your home
          screen first.
        </p>
      ) : !state.ready ? (
        <p className={styles.note}>Checking...</p>
      ) : !state.serverOn ? (
        <p className={styles.note}>Notifications are not set up on this server.</p>
      ) : (
        <>
          <p className={styles.note}>
            Get a notification for new messages when Chatify is not open. Muted conversations stay
            quiet.
          </p>
          {error ? <Alert>{error}</Alert> : null}
          <div>
            <Button
              variant="secondary"
              loading={busy}
              leadingIcon={state.subscribed ? BellOff : Bell}
              onClick={toggle}
            >
              {state.subscribed ? 'Turn off on this device' : 'Turn on for this device'}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
