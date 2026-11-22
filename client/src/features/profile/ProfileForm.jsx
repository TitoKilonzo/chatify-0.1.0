import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { AvatarSection } from './AvatarSection.jsx';
import { fieldErrorsFrom, validateDisplayName } from '../auth/validation.js';
import { useUpdateProfile } from './useProfile.js';
import styles from './Settings.module.css';

export function ProfileForm({ user }) {
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [clientError, setClientError] = useState(null);

  const serverError = fieldErrorsFrom(update.error).displayName;
  const formError = update.error && !serverError ? update.error.message : null;
  const unchanged = displayName.trim() === user.displayName;

  function onChange(event) {
    setDisplayName(event.target.value);
    setClientError(null);
    if (update.isSuccess || update.isError) {
      update.reset();
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const message = validateDisplayName(displayName);
    setClientError(message);
    if (message) {
      event.currentTarget.elements.namedItem('displayName')?.focus();
      return;
    }
    update.mutate({ displayName: displayName.trim() });
  }

  return (
    <section className={styles.section} aria-labelledby="profile-heading">
      <h2 id="profile-heading" className={styles.heading}>
        Profile
      </h2>
      <AvatarSection user={user} />
      <dl className={styles.facts}>
        <div>
          <dt>Username</dt>
          <dd>@{user.username}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
      </dl>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError ? <Alert>{formError}</Alert> : null}
        {update.isSuccess ? <Alert variant="success">Profile updated.</Alert> : null}
        <Input
          label="Display name"
          name="displayName"
          value={displayName}
          onChange={onChange}
          error={clientError ?? serverError}
          autoComplete="name"
          required
        />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" loading={update.isPending} disabled={unchanged}>
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}
