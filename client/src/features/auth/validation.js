// Client-side checks mirror the server rules so users get instant feedback. The server remains
// the authority and its field errors are shown too (see fieldErrorsFrom).

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

function checkPassword(password) {
  if (!password) {
    return 'Password is required';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}

export function validateDisplayName(displayName) {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return 'Display name is required';
  }
  if (trimmed.length > 50) {
    return 'Display name must be at most 50 characters';
  }
  return null;
}

/** Each validator returns an object of { fieldName: message }, empty when the input is valid. */
function collect(entries) {
  return Object.fromEntries(entries.filter(([, message]) => message));
}

export function validateLogin({ identifier, password }) {
  return collect([
    ['identifier', identifier.trim() ? null : 'Email or username is required'],
    ['password', password ? null : 'Password is required'],
  ]);
}

export function validateRegister({ displayName, username, email, password }) {
  return collect([
    ['displayName', validateDisplayName(displayName)],
    [
      'username',
      USERNAME_PATTERN.test(username.trim())
        ? null
        : 'Username must be 3-30 characters: letters, numbers, underscore',
    ],
    ['email', EMAIL_PATTERN.test(email.trim()) ? null : 'Enter a valid email address'],
    ['password', checkPassword(password)],
  ]);
}

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  return collect([
    ['currentPassword', currentPassword ? null : 'Current password is required'],
    [
      'newPassword',
      checkPassword(newPassword) ??
        (newPassword === currentPassword
          ? 'New password must be different from the current password'
          : null),
    ],
    ['confirmPassword', confirmPassword === newPassword ? null : 'Passwords do not match'],
  ]);
}

/** Convert an ApiError's details ([{ path, message }]) into { fieldName: message }. */
export function fieldErrorsFrom(error) {
  const details = error?.details ?? [];
  return Object.fromEntries(details.map((detail) => [detail.path, detail.message]));
}
