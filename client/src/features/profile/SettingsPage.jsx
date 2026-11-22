import { InstallButton } from '../../components/InstallButton.jsx';
import { useInstallState } from '../../lib/pwa.js';
import { useSession } from '../auth/useSession.js';
import { SHORTCUTS } from '../chat/useShortcuts.js';
import { PasswordForm } from './PasswordForm.jsx';
import { ProfileForm } from './ProfileForm.jsx';
import styles from './Settings.module.css';

export function SettingsPage() {
  const { data: user } = useSession();
  const { installed } = useInstallState();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <ProfileForm user={user} />
      <PasswordForm />
      <section className={styles.section} aria-labelledby="install-heading">
        <h2 id="install-heading" className={styles.heading}>
          Install app
        </h2>
        {installed ? (
          <p className={styles.note}>Chatify is installed on this device.</p>
        ) : (
          <>
            <p className={styles.note}>
              Add Chatify to your home screen or desktop so it opens in its own window.
            </p>
            <div>
              <InstallButton variant="secondary" />
            </div>
          </>
        )}
      </section>
      <section className={styles.section} aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading" className={styles.heading}>
          Keyboard shortcuts
        </h2>
        <dl className={styles.shortcuts}>
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className={styles.shortcut}>
              <dt>
                <kbd>{shortcut.keys}</kbd>
              </dt>
              <dd>{shortcut.action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
