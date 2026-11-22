import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import { useFormValues } from '../../hooks/useFormValues.js';
import {
  fieldErrorsFrom,
  PASSWORD_MIN_LENGTH,
  validatePasswordChange,
} from '../auth/validation.js';
import { useChangePassword } from './useProfile.js';
import styles from './Settings.module.css';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function PasswordForm() {
  const change = useChangePassword();
  const [values, handleChange, setValues] = useFormValues(EMPTY);
  const [clientErrors, setClientErrors] = useState({});

  const serverErrors = fieldErrorsFrom(change.error);
  const errors = { ...serverErrors, ...clientErrors };
  const formError =
    change.error && Object.keys(serverErrors).length === 0 ? change.error.message : null;

  function onChange(event) {
    const { name } = event.target;
    handleChange(event);
    setClientErrors(({ [name]: _removed, ...rest }) => rest);
    if (change.isSuccess || change.isError) {
      change.reset();
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const found = validatePasswordChange(values);
    setClientErrors(found);
    const [firstInvalid] = Object.keys(found);
    if (firstInvalid) {
      event.currentTarget.elements.namedItem(firstInvalid)?.focus();
      return;
    }
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      { onSuccess: () => setValues(EMPTY) },
    );
  }

  return (
    <section className={styles.section} aria-labelledby="password-heading">
      <h2 id="password-heading" className={styles.heading}>
        Change password
      </h2>
      <p className={styles.note}>Changing your password signs you out of every other device.</p>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError ? <Alert>{formError}</Alert> : null}
        {change.isSuccess ? <Alert variant="success">Password changed.</Alert> : null}
        <PasswordInput
          label="Current password"
          name="currentPassword"
          value={values.currentPassword}
          onChange={onChange}
          error={errors.currentPassword}
          autoComplete="current-password"
          required
        />
        <PasswordInput
          label="New password"
          name="newPassword"
          value={values.newPassword}
          onChange={onChange}
          error={errors.newPassword}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
          autoComplete="new-password"
          required
        />
        <PasswordInput
          label="Confirm new password"
          name="confirmPassword"
          value={values.confirmPassword}
          onChange={onChange}
          error={errors.confirmPassword}
          autoComplete="new-password"
          required
        />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" loading={change.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}
