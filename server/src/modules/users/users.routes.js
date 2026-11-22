import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  changePasswordBody,
  searchUsersQuery,
  updateProfileBody,
  userIdParams,
} from './users.schemas.js';

export function createUsersRouter({
  controller,
  attachmentsController,
  avatarUpload,
  uploadLimiter,
  requireAuth,
  credentialLimiter,
}) {
  const router = Router();

  router.use(requireAuth);
  router.get('/', validate({ query: searchUsersQuery }), controller.search);
  router.patch('/me', validate({ body: updateProfileBody }), controller.updateProfile);
  router.post(
    '/me/password',
    credentialLimiter,
    validate({ body: changePasswordBody }),
    controller.changePassword,
  );
  router.put('/me/avatar', uploadLimiter, avatarUpload, attachmentsController.setMyAvatar);
  router.delete('/me/avatar', attachmentsController.clearMyAvatar);
  router.get(
    '/:userId/avatar',
    validate({ params: userIdParams }),
    attachmentsController.userAvatar,
  );

  return router;
}
