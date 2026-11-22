import { z } from 'zod';

const NO_CONTROL_CHARS = /^[^\p{Cc}]+$/u;

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters');

const displayName = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(50, 'Display name must be at most 50 characters')
  .regex(NO_CONTROL_CHARS, 'Display name contains invalid characters');

// Usernames and emails are normalised to lower case so uniqueness is case-insensitive.
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,30}$/, 'Username must be 3-30 characters: letters, numbers, underscore');

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));

export const registerBody = z.object({
  displayName,
  username,
  email,
  password: passwordSchema,
});

export const loginBody = z.object({
  identifier: z.string().trim().toLowerCase().min(1, 'Email or username is required').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

export { displayName as displayNameSchema };
