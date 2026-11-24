import { z } from 'zod';

export const subscribeBody = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
});

export const unsubscribeBody = z.object({ endpoint: z.url().max(2048) });
