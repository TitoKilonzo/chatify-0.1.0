import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PasswordInput } from '../../components/ui/PasswordInput.jsx';
import { useFormValues } from '../../hooks/useFormValues.js';
import { AuthLayout } from './AuthLayout.jsx';
import { fieldErrorsFrom, PASSWORD_MIN_LENGTH, validateRegister } from './validation.js';
import { useRegister } from './useSession.js';
import styles from './forms.module.css';

export function RegisterPage() {
  const register = useRegister();
  const [values, handleChange] = useFormValues({
    displayName: '',
    username: '',
    email: '',
    password: '',
  });
  const [clientErrors, setClientErrors] = useState({});

  const serverErrors = fieldErrorsFrom(register.error);
  const errors = { ...serverErrors, ...clientErrors };
  const formError =
    register.error && Object.keys(serverErrors).length === 0 ? register.error.message : null;

  function onChange(event) {
    const { name } = event.target;
    handleChange(event);
    setClientErrors(({ [name]: _removed, ...rest }) => rest);
    if (register.isError) {
      register.reset();
    }
  }

  function onSubmit(event) {
    event.preventDefault();
    const found = validateRegister(values);
    setClientErrors(found);
    const [firstInvalid] = Object.keys(found);
    if (firstInvalid) {
      event.currentTarget.elements.namedItem(firstInvalid)?.focus();
      return;
    }
    register.mutate({
      displayName: values.displayName.trim(),
      username: values.username.trim(),
      email: values.email.trim(),
      password: values.password,
    });
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Pick a username so people can find you."
      footerText="Already have an account?"
      footerLink={{ to: '/login', label: 'Sign in' }}
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError ? <Alert>{formError}</Alert> : null}
        <Input
          label="Display name"
          name="displayName"
          value={values.displayName}
          onChange={onChange}
          error={errors.displayName}
          autoComplete="name"
          required
        />
        <Input
          label="Username"
          name="username"
          value={values.username}
          onChange={onChange}
          error={errors.username}
          hint="3-30 characters: letters, numbers, underscore"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <Input
          label="Email"
          name="email"
          type="email"
          value={values.email}
          onChange={onChange}
          error={errors.email}
          autoComplete="email"
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
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
          autoComplete="new-password"
          required
        />
        <Button type="submit" variant="primary" loading={register.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
