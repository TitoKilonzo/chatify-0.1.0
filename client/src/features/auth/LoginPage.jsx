import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import { useFormValues } from '../../hooks/useFormValues.js';
import { AuthLayout } from './AuthLayout.jsx';
import { fieldErrorsFrom, validateLogin } from './validation.js';
import { useLogin } from './useSession.js';
import styles from './forms.module.css';

export function LoginPage() {
  const login = useLogin();
  const [values, handleChange] = useFormValues({ identifier: '', password: '' });
  const [clientErrors, setClientErrors] = useState({});

  const serverErrors = fieldErrorsFrom(login.error);
  const errors = { ...serverErrors, ...clientErrors };
  // Errors without a field (wrong credentials, lockout, rate limit) are shown above the form.
  const formError =
    login.error && Object.keys(serverErrors).length === 0 ? login.error.message : null;

  function onChange(event) {
    const { name } = event.target;
    handleChange(event);
    setClientErrors(({ [name]: _removed, ...rest }) => rest);
    if (login.isError) {
      login.reset();
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const found = validateLogin(values);
    setClientErrors(found);
    const [firstInvalid] = Object.keys(found);
    if (firstInvalid) {
      event.currentTarget.elements.namedItem(firstInvalid)?.focus();
      return;
    }
    login.mutate(values);
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Welcome back. Sign in to continue your conversations."
      footerText="New to Chatify?"
      footerLink={{ to: '/register', label: 'Create an account' }}
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError ? <Alert>{formError}</Alert> : null}
        <Input
          label="Email or username"
          name="identifier"
          value={values.identifier}
          onChange={onChange}
          error={errors.identifier}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <PasswordInput
          label="Password"
          name="password"
          value={values.password}
          onChange={onChange}
          error={errors.password}
          autoComplete="current-password"
          required
        />
        <Button type="submit" variant="primary" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
