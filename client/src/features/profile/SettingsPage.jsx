import { useSession } from '../auth/useSession.js';
import { DevicesSection } from './DevicesSection.jsx';
import { EncryptionKeysSection } from './EncryptionKeysSection.jsx';
import { DataSaverSection } from './DataSaverSection.jsx';
import { PhoneSection } from './PhoneSection.jsx';
import { NotificationsSection } from './NotificationsSection.jsx';
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
      <DevicesSection />
      <PhoneSection />
      <NotificationsSection />
      <EncryptionKeysSection userId={user.id} />
      <DataSaverSection />
    </div>
  );
}
