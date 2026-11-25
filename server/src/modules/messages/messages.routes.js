import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  conversationIdParams,
  editMessageBody,
  forwardBody,
  listMessagesQuery,
  markReadBody,
  messageIdParams,
  reactionBody,
  searchQuery,
  sendMessageBody,
  syncQuery,
  threadQuery,
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
  router.get('/:conversationId/pins', validate({ params: conversationIdParams }), controller.pins);
  router.post(
    '/:conversationId/read',
    validate({ params: conversationIdParams, body: markReadBody }),
    controller.markRead,
  );
  return router;
}

/** Routes under /api/messages and /api/sync. */
export function createMessagesRouter({ controller, requireAuth, sendLimiter, searchLimiter }) {
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
  router.get(
    '/messages/:messageId/thread',
    requireAuth,
    validate({ params: messageIdParams, query: threadQuery }),
    controller.thread,
  );
  router.put(
    '/messages/:messageId/reaction',
    requireAuth,
    validate({ params: messageIdParams, body: reactionBody }),
    controller.react,
  );
  router.delete(
    '/messages/:messageId/reaction',
    requireAuth,
    validate({ params: messageIdParams }),
    controller.unreact,
  );
  router.put(
    '/messages/:messageId/pin',
    requireAuth,
    validate({ params: messageIdParams }),
    controller.pin,
  );
  router.delete(
    '/messages/:messageId/pin',
    requireAuth,
    validate({ params: messageIdParams }),
    controller.unpin,
  );
  router.post(
    '/messages/:messageId/forward',
    requireAuth,
    sendLimiter,
    validate({ params: messageIdParams, body: forwardBody }),
    controller.forward,
  );
  router.get(
    '/search/messages',
    requireAuth,
    searchLimiter,
    validate({ query: searchQuery }),
    controller.search,
  );
  router.get('/sync', requireAuth, validate({ query: syncQuery }), controller.sync);
  return router;
}
