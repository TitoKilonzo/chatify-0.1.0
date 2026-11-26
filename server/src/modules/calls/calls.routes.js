import { Router } from 'express';
import { buildIceServers } from './ice.js';

/** Connection settings for a call. Credentials are short-lived and tied to the signed-in user. */
export function createCallsRouter({ env, callsService }) {
  const router = Router();
  router.get('/history', async (req, res, next) => {
    try {
      res.json({ calls: await callsService.history(req.auth.userId) });
    } catch (err) {
      next(err);
    }
  });
  router.get('/ice', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ iceServers: buildIceServers(env, req.auth.userId) });
  });
  return router;
}
