import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

const attachmentParams = z.object({ attachmentId: z.uuid() });

export function createAttachmentsRouter({ controller, upload, uploadLimiter }) {
  const router = Router();
  router.post('/', uploadLimiter, upload, controller.upload);
  router.get('/:attachmentId', validate({ params: attachmentParams }), controller.download);
  router.get(
    '/:attachmentId/thumbnail',
    validate({ params: attachmentParams }),
    controller.thumbnail,
  );
  return router;
}

const groupParams = z.object({ conversationId: z.uuid() });

/** Group avatar endpoints, mounted under /api/conversations by the conversations router. */
export function createGroupAvatarRouter({ controller, avatarUpload, uploadLimiter }) {
  const router = Router();
  router.get('/:conversationId/avatar', validate({ params: groupParams }), controller.groupAvatar);
  router.put(
    '/:conversationId/avatar',
    uploadLimiter,
    validate({ params: groupParams }),
    avatarUpload,
    controller.setGroupAvatar,
  );
  router.delete(
    '/:conversationId/avatar',
    validate({ params: groupParams }),
    controller.clearGroupAvatar,
  );
  return router;
}
