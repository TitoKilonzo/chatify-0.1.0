import { z } from 'zod';
import { displayNameSchema, passwordSchema } from '../auth/auth.schemas.js';

export const updateProfileBody = z.object({
  displayName: displayNameSchema,
});

export const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });

export const searchUsersQuery = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(50),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export const userIdParams = z.object({ userId: z.uuid() });
