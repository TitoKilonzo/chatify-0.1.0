import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { api } from '../../lib/api.js';
import { formatLastSeen } from '../../lib/date.js';
import { describeDevice } from '../../lib/device.js';
import styles from './Settings.module.css';

const devicesKey = ['sessions'];

/** The devices signed in to this account, with the option to end the others. */
export function DevicesSection() {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(null); // a session, or 'all'

  const query = useQuery({
    queryKey: devicesKey,
    queryFn: async () => (await api.get('/auth/sessions')).sessions,
  });

  const end = useMutation({
    mutationFn: (id) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: devicesKey }),
    onSettled: () => setConfirming(null),
  });
  const endOthers = useMutation({
    mutationFn: () => api.post('/auth/sessions/revoke-others', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: devicesKey }),
    onSettled: () => setConfirming(null),
  });

  const sessions = query.data ?? [];
  const others = sessions.filter((session) => !session.current);
  const busy = end.isPending || endOthers.isPending;
  const error = query.error ?? end.error ?? endOthers.error;

  return (
    <section className={styles.section} aria-labelledby="devices-heading">
      <h2 id="devices-heading" className={styles.heading}>
        Devices
      </h2>
      <p className={styles.note}>
        Places where you are signed in. If you do not recognise one, end it and change your
        password.
      </p>
      {error ? <Alert>{error.message}</Alert> : null}
      <ul className={styles.deviceList}>
        {sessions.map((session) => {
          const device = describeDevice(session.userAgent);
          const Icon = device.mobile ? Smartphone : Laptop;
          return (
            <li key={session.id} className={styles.device}>
              <Icon size={20} aria-hidden="true" />
              <div className={styles.deviceInfo}>
                <span className={styles.deviceName}>
                  {device.label}
                  {session.current ? ' (this device)' : ''}
                </span>
                <span className={styles.note}>
                  {session.current ? 'Active now' : formatLastSeen(session.lastActiveAt)}
                </span>
              </div>
              {session.current ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  leadingIcon={LogOut}
                  onClick={() => setConfirming(session)}
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 1 ? (
        <div>
          <Button variant="secondary" onClick={() => setConfirming('all')}>
            Sign out all other devices
          </Button>
        </div>
      ) : null}

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming === 'all' ? 'Sign out all other devices?' : 'Sign out this device?'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                confirming === 'all' ? endOthers.mutate() : end.mutate(confirming.id)
              }
            >
              Sign out
            </Button>
          </>
        }
      >
        <p>
          {confirming === 'all'
            ? 'Every other device will need to sign in again.'
            : `${describeDevice(confirming?.userAgent).label} will need to sign in again.`}
        </p>
      </Dialog>
    </section>
  );
}
