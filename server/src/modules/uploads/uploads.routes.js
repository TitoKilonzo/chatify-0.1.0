import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { validationFailed } from '../../utils/errors.js';

const idParams = z.object({ uploadId: z.uuid() });
const createBody = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(1),
});

export function createUploadsRouter({ uploadsService, uploadLimiter, chunkLimiter }) {
  const router = Router();

  router.get('/limits', (_req, res) => res.json(uploadsService.limits));

  router.post('/', uploadLimiter, validate({ body: createBody }), async (req, res) => {
    res.status(201).json({
      upload: await uploadsService.create(req.auth.userId, req.validated.body),
    });
  });

  router.get('/:uploadId', validate({ params: idParams }), async (req, res) => {
    res.json({
      upload: await uploadsService.status(req.auth.userId, req.validated.params.uploadId),
    });
  });

  // The body is the raw chunk (application/octet-stream); Upload-Offset says where it belongs.
  router.patch('/:uploadId', chunkLimiter, validate({ params: idParams }), async (req, res) => {
    const header = req.get('upload-offset');
    if (!/^\d{1,15}$/.test(header ?? '')) {
      throw validationFailed([{ path: 'Upload-Offset', message: 'Send the byte offset' }]);
    }
    const upload = await uploadsService.append(
      req.auth.userId,
      req.validated.params.uploadId,
      Number(header),
      req,
    );
    res.json({ upload });
  });

  router.post('/:uploadId/complete', validate({ params: idParams }), async (req, res) => {
    const attachment = await uploadsService.complete(
      req.auth.userId,
      req.validated.params.uploadId,
    );
    res.status(201).json({ attachment });
  });

  router.delete('/:uploadId', validate({ params: idParams }), async (req, res) => {
    await uploadsService.cancel(req.auth.userId, req.validated.params.uploadId);
    res.status(204).end();
  });

  return router;
}
