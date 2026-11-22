import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  conversationIdParams,
  editMessageBody,
  listMessagesQuery,
  markReadBody,
  messageIdParams,
  sendMessageBody,
  syncQuery,
} from './messages.schemas.js';

/** Routes nested under /api/conversations/:conversationId. mergeParams is not needed: we parse. */
export function createConversationMessagesRouter({ controller, sendLimiter }) {
  const router = Router({ mergeParams: true });
  router.get(
    '/:conversationId/messages',
    validate({ params: conversationIdParams, query: listMessagesQuery }),
    controller.list,
  );
  router.post(
    '/:conversationId/messages',
    sendLimiter,
    validate({ params: conversationIdParams, body: sendMessageBody }),
    controller.send,
  );
  router.post(
    '/:conversationId/read',
    validate({ params: conversationIdParams, body: markReadBody }),
    controller.markRead,
  );
  return router;
}

/** Routes under /api/messages and /api/sync. */
export function createMessagesRouter({ controller, requireAuth }) {
  const router = Router();
  router.patch(
    '/messages/:messageId',
    requireAuth,
    validate({ params: messageIdParams, body: editMessageBody }),
    controller.edit,
  );
  router.delete(
    '/messages/:messageId',
    requireAuth,
    validate({ params: messageIdParams }),
    controller.remove,
  );
  router.get('/sync', requireAuth, validate({ query: syncQuery }), controller.sync);
  return router;
}
