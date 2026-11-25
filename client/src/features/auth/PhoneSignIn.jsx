import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Phone, User } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { api } from '../../lib/api.js';
import { sessionKey } from './useSession.js';
import styles from './forms.module.css';

/** Whether this server can send sign-in codes by SMS. The option is hidden when it cannot. */
export function usePhoneEnabled() {
  const query = useQuery({
    queryKey: ['phone-config'],
    queryFn: () => api.get('/phone/config'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data?.enabled === true;
}

/**
 * Sign in with a phone number: enter the number, then the 6 digit code from the text message.
 * A number that has never signed in is asked for a name once, then the account is created.
 */
export function PhoneSignIn({ onBack }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState('phone'); // phone | code | name
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  const sendCode = (event) => {
    event?.preventDefault();
    run(async () => {
      await api.post('/phone/login/request', { phone });
      setStep('code');
    });
  };

  const verify = (event) => {
    event.preventDefault();
    run(async () => {
      const body = { phone, code };
      if (step === 'name') {
        body.displayName = displayName;
      }
      const data = await api.post('/phone/login/verify', body);
      if (data.needsProfile) {
        setStep('name');
        return;
      }
      queryClient.setQueryData(sessionKey, data.user);
    });
  };

  return (
    <div className={styles.form}>
      {error ? <Alert>{error}</Alert> : null}

      {step === 'phone' ? (
        <form className={styles.form} onSubmit={sendCode} noValidate>
          <Input
            label="Phone number"
            leadingIcon={Phone}
            type="tel"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            hint="Include the country code, or start with 0 for a Kenyan number."
            autoComplete="tel"
            required
          />
          <Button type="submit" variant="primary" loading={busy} disabled={phone.trim().length < 5}>
            Send code
          </Button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={verify} noValidate>
          <Input
            label="6 digit code"
            leadingIcon={KeyRound}
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            hint={`We sent a text to ${phone}.`}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
          {step === 'name' ? (
            <Input
              label="Your name"
              leadingIcon={User}
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              hint="This is how people will see you. You are new here, so we will create your account."
              maxLength={60}
              autoComplete="name"
              required
            />
          ) : null}
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={code.length !== 6 || (step === 'name' && !displayName.trim())}
          >
            {step === 'name' ? 'Create account' : 'Verify and sign in'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={sendCode}>
            Send a new code
          </Button>
        </form>
      )}

      <Button variant="ghost" onClick={onBack}>
        Use email or username instead
      </Button>
    </div>
  );
}
