import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { api } from '../../lib/api.js';
import { usePhoneEnabled } from '../auth/PhoneSignIn.jsx';
import { sessionKey, useSession } from '../auth/useSession.js';
import styles from './Settings.module.css';

/** Add a phone number to the account so it can sign in with a text message code. */
export function PhoneSection() {
  const enabled = usePhoneEnabled();
  const { data: user } = useSession();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!enabled) {
    return null;
  }

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const request = (event) => {
    event?.preventDefault();
    run(async () => {
      await api.post('/phone/link/request', { phone });
      setSent(true);
    });
  };

  const confirm = (event) => {
    event.preventDefault();
    run(async () => {
      const data = await api.post('/phone/link/verify', { phone, code });
      queryClient.setQueryData(sessionKey, data.user);
      setSent(false);
      setPhone('');
      setCode('');
    });
  };

  const remove = () =>
    run(async () => {
      await api.delete('/phone');
      queryClient.setQueryData(sessionKey, { ...user, phone: null });
    });

  return (
    <section className={styles.section} aria-labelledby="phone-heading">
      <h2 id="phone-heading" className={styles.heading}>
        Phone number
      </h2>
      {error ? <Alert>{error}</Alert> : null}
      {user?.phone ? (
        <>
          <p className={styles.note}>
            You can sign in with {user.phone}. We send a code by text message each time.
          </p>
          <div>
            <Button variant="secondary" loading={busy} onClick={remove}>
              Remove number
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={sent ? confirm : request} className={styles.section} noValidate>
          <p className={styles.note}>
            Add a number to sign in with a code sent by text message, without your password.
          </p>
          <Input
            label="Phone number"
            leadingIcon={Phone}
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            disabled={sent}
            hint="Include the country code, or start with 0 for a Kenyan number."
            autoComplete="tel"
          />
          {sent ? (
            <Input
              label="6 digit code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          ) : null}
          <div>
            <Button
              type="submit"
              variant="secondary"
              loading={busy}
              disabled={sent ? code.length !== 6 : phone.trim().length < 5}
            >
              {sent ? 'Verify number' : 'Send code'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
