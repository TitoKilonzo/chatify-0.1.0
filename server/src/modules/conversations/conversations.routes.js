import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  addMembersBody,
  conversationIdParams,
  createGroupBody,
  memberParams,
  openDirectBody,
  preferencesBody,
  disappearingBody,
  encryptionBody,
  renameGroupBody,
  setRoleBody,
} from './conversations.schemas.js';

export function createConversationsRouter({ controller, extraRouters = [] }) {
  const router = Router();

  router.get('/', controller.list);
  router.post('/direct', validate({ body: openDirectBody }), controller.openDirect);
  router.post('/group', validate({ body: createGroupBody }), controller.createGroup);
  router.get('/:conversationId', validate({ params: conversationIdParams }), controller.get);
  router.patch(
    '/:conversationId',
    validate({ params: conversationIdParams, body: renameGroupBody }),
    controller.rename,
  );
  router.put(
    '/:conversationId/encryption',
    validate({ params: conversationIdParams, body: encryptionBody }),
    controller.setEncryption,
  );
  router.put(
    '/:conversationId/disappearing',
    validate({ params: conversationIdParams, body: disappearingBody }),
    controller.setDisappearing,
  );
  router.put(
    '/:conversationId/preferences',
    validate({ params: conversationIdParams, body: preferencesBody }),
    controller.setPreferences,
  );
  router.post(
    '/:conversationId/members',
    validate({ params: conversationIdParams, body: addMembersBody }),
    controller.addMembers,
  );
  router.delete(
    '/:conversationId/members/:userId',
    validate({ params: memberParams }),
    controller.removeMember,
  );
  router.patch(
    '/:conversationId/members/:userId',
    validate({ params: memberParams, body: setRoleBody }),
    controller.setRole,
  );
  router.post(
    '/:conversationId/leave',
    validate({ params: conversationIdParams }),
    controller.leave,
  );

  // Routers that add more /:conversationId/... endpoints (messages, avatar) are mounted here.
  for (const extra of extraRouters) {
    router.use(extra);
  }
  return router;
}
