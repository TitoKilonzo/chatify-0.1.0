import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { conflict, notFound } from '../../utils/errors.js';

// An uncompressed P-256 point is 65 bytes: 87 characters of unpadded base64url.
const publicKeyBody = z.object({ publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/) });
const backupBody = z.object({ backup: z.string().min(20).max(8192) });
const userParams = z.object({ userId: z.uuid() });

/**
 * Key directory for end-to-end encryption. Public keys are public to signed-in users. The backup
 * is an opaque blob locked with a passphrase on the device; the server only stores it.
 */
export function createKeysRouter({ keysRepository, requireAuth, now = () => new Date() }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/me', async (req, res) => {
    const row = await keysRepository.get(req.auth.userId);
    res.json({ publicKey: row?.publicKey ?? null, hasBackup: Boolean(row?.backup) });
  });

  router.put('/me', validate({ body: publicKeyBody }), async (req, res) => {
    await keysRepository.upsertPublicKey(req.auth.userId, req.validated.body.publicKey, now());
    res.status(204).end();
  });

  router.put('/me/backup', validate({ body: backupBody }), async (req, res) => {
    if (!(await keysRepository.get(req.auth.userId))) {
      throw conflict('NO_KEY', 'Create your key before backing it up');
    }
    await keysRepository.setBackup(req.auth.userId, req.validated.body.backup, now());
    res.status(204).end();
  });

  router.get('/me/backup', async (req, res) => {
    const row = await keysRepository.get(req.auth.userId);
    if (!row?.backup) {
      throw notFound('No key backup');
    }
    res.json({ backup: row.backup, publicKey: row.publicKey });
  });

  router.delete('/me/backup', async (req, res) => {
    if (await keysRepository.get(req.auth.userId)) {
      await keysRepository.setBackup(req.auth.userId, null, now());
    }
    res.status(204).end();
  });

  router.get('/:userId', validate({ params: userParams }), async (req, res) => {
    const row = await keysRepository.get(req.validated.params.userId);
    if (!row) {
      throw notFound('No key for this user');
    }
    res.json({ publicKey: row.publicKey });
  });

  return router;
}
