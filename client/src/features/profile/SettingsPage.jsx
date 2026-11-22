import { useSession } from '../auth/useSession.js';
import { SHORTCUTS } from '../chat/useShortcuts.js';
import { PasswordForm } from './PasswordForm.jsx';
import { ProfileForm } from './ProfileForm.jsx';
import styles from './Settings.module.css';

export function SettingsPage() {
  const { data: user } = useSession();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <ProfileForm user={user} />
      <PasswordForm />
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
