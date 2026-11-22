import { z } from 'zod';

const groupName = z.string().trim().min(1, 'Name is required').max(60);

export const conversationIdParams = z.object({ conversationId: z.uuid() });
export const memberParams = z.object({ conversationId: z.uuid(), userId: z.uuid() });

export const openDirectBody = z.object({ userId: z.uuid() });
export const createGroupBody = z.object({
  name: groupName,
  memberIds: z.array(z.uuid()).min(1).max(255),
});
export const renameGroupBody = z.object({ name: groupName });
export const addMembersBody = z.object({ userIds: z.array(z.uuid()).min(1).max(255) });
export const setRoleBody = z.object({ role: z.enum(['admin', 'member']) });
export const preferencesBody = z
  .object({ archived: z.boolean().optional(), muted: z.boolean().optional() })
  .refine((value) => value.archived !== undefined || value.muted !== undefined, {
    message: 'Provide archived or muted',
  });
