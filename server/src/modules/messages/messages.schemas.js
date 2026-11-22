import { z } from 'zod';
import { MAX_BODY_LENGTH } from './messages.service.js';

const clientId = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'must contain only letters, digits, underscores and hyphens');

export const conversationIdParams = z.object({ conversationId: z.uuid() });
export const messageIdParams = z.object({ messageId: z.coerce.number().int().positive() });

export const sendMessageBody = z.object({
  clientId,
  body: z.string().max(MAX_BODY_LENGTH).default(''),
  attachmentId: z.uuid().optional(),
});

export const editMessageBody = z.object({ body: z.string().max(MAX_BODY_LENGTH) });

// "createdAtMs.id" of the oldest message the client already has.
const cursor = z
  .string()
  .regex(/^\d{1,16}\.\d{1,12}$/, 'invalid cursor')
  .transform((value) => {
    const [createdAt, id] = value.split('.').map(Number);
    return { createdAt, id };
  });

export const listMessagesQuery = z.object({
  before: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

export const markReadBody = z.object({
  upToMessageId: z.number().int().positive().optional(),
});

export const syncQuery = z.object({
  afterId: z.coerce.number().int().min(0).default(0),
});
