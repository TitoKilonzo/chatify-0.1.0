import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useAvatar } from './useProfile.js';
import styles from './Settings.module.css';

const MAX_BYTES = 5 * 1024 * 1024;

export function AvatarSection({ user }) {
  const { upload, remove } = useAvatar();
  const fileRef = useRef(null);
  const [tooLarge, setTooLarge] = useState(false);
  const error = upload.error ?? remove.error;

  function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    // The server enforces the limit authoritatively; this only avoids a pointless large upload.
    if (file.size > MAX_BYTES) {
      setTooLarge(true);
      return;
    }
    setTooLarge(false);
    upload.mutate(file);
  }

  return (
    <div className={styles.avatarRow}>
      <Avatar name={user.displayName} src={user.avatarUrl} size="lg" decorative />
      <div className={styles.avatarActions}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
        />
        <Button
          leadingIcon={Camera}
          loading={upload.isPending}
          onClick={() => fileRef.current?.click()}
        >
          Change photo
        </Button>
        {user.avatarUrl ? (
          <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
            Remove photo
          </Button>
        ) : null}
      </div>
      {tooLarge ? <Alert>Photos can be at most 5 MB.</Alert> : null}
      {error ? <Alert>{error.message}</Alert> : null}
    </div>
  );
}
