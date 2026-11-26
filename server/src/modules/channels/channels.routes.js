import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import {
  channelSearchQuery,
  conversationIdParams,
  createChannelBody,
  updateChannelBody,
} from '../conversations/conversations.schemas.js';

/**
 * Channels are groups where only admins post. These routes cover what groups do not: creating one,
 * finding public ones, joining, and changing a channel's description or visibility. Members,
 * roles, leaving, and messages use the ordinary conversation routes.
 */
export function createChannelsRouter({ conversationsService }) {
  const router = Router();

  router.get('/', validate({ query: channelSearchQuery }), async (req, res) => {
    const channels = await conversationsService.discoverChannels(
      req.auth.userId,
      req.validated.query.q,
    );
    res.json({ channels });
  });

  router.post('/', validate({ body: createChannelBody }), async (req, res) => {
    const conversation = await conversationsService.createChannel(
      req.auth.userId,
      req.validated.body,
    );
    res.status(201).json({ conversation });
  });

  router.post(
    '/:conversationId/join',
    validate({ params: conversationIdParams }),
    async (req, res) => {
      const conversation = await conversationsService.joinChannel(
        req.auth.userId,
        req.validated.params.conversationId,
      );
      res.json({ conversation });
    },
  );

  router.patch(
    '/:conversationId',
    validate({ params: conversationIdParams, body: updateChannelBody }),
    async (req, res) => {
      const conversation = await conversationsService.updateChannel(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body,
      );
      res.json({ conversation });
    },
  );

  return router;
}
