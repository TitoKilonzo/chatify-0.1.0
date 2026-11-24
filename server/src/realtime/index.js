import { parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { ZodError, z } from 'zod';
import { ACCESS_COOKIE } from '../modules/auth/cookies.js';
import { sendMessageBody } from '../modules/messages/messages.schemas.js';
import { AppError } from '../utils/errors.js';
import { createPresence } from './presence.js';
import { createRateWindow } from './rate-window.js';
import { createRegistry } from './registry.js';
import { createTyping } from './typing.js';

const ACK_TIMEOUT_MS = 5000;
const MAX_PAYLOAD_BYTES = 64 * 1024;

const sendPayload = sendMessageBody.extend({ conversationId: z.uuid() });
const readPayload = z.object({
  conversationId: z.uuid(),
  upToMessageId: z.number().int().positive().optional(),
});
const typingPayload = z.object({ conversationId: z.uuid(), typing: z.boolean() });

function handshakeError(code) {
  const err = new Error(code);
  err.data = { code };
  return err;
}

/** Convert any thrown value into the { code, message, details } shape used in acks. */
function toErrorPayload(err, logger) {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, details: err.details };
  }
  if (err instanceof ZodError) {
    return {
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  logger.error({ err }, 'unexpected socket handler error');
  return { code: 'INTERNAL', message: 'Something went wrong' };
}

/**
 * Attach Socket.io to the HTTP server.
 *
 * Authentication happens once, in the handshake, from the same httpOnly access cookie the REST API
 * uses. Logout, password change and token-reuse detection publish "user.sessions-revoked", which
 * drops that user's sockets; clients then reconnect and are admitted only while a session remains.
 *
 * Runs in a single process: the registry and presence state are in memory. Scaling out needs the
 * Socket.io Redis adapter and shared presence storage.
 */
export async function attachRealtime({
  server,
  env,
  logger,
  container,
  presenceGraceMs = 5000,
  typingTtlMs = 3000,
}) {
  const {
    events,
    accessTokens,
    refreshTokensRepository,
    usersRepository,
    conversationsRepository,
    messagesService,
  } = container;

  const allowedOrigins = new Set(env.CORS_ORIGINS);
  const registry = createRegistry();
  // Users with a live socket see messages in the app; only the others get a push notification.
  container.pushService.setOnlineCheck((userId) => registry.isOnline(userId));

  const io = new Server(server, {
    serveClient: false,
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    // Browsers always send Origin on websocket upgrades, which blocks cross-site hijacking.
    // Requests without Origin (non-browser clients) are allowed; they hold no ambient cookies.
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      if (!origin) {
        callback(null, true);
        return;
      }
      let sameHost = false;
      try {
        sameHost = new URL(origin).host === req.headers.host;
      } catch {
        sameHost = false;
      }
      callback(null, allowedOrigins.has(origin) || sameHost);
    },
  });

  function emitToUsers(userIds, event, payload, { exceptUserId } = {}) {
    for (const userId of new Set(userIds)) {
      if (userId === exceptUserId) {
        continue;
      }
      for (const socket of registry.forUser(userId)) {
        socket.emit(event, payload);
      }
    }
  }

  const presence = createPresence({
    usersRepository,
    conversationsRepository,
    registry,
    emitToUsers,
    logger,
    graceMs: presenceGraceMs,
  });

  const typing = createTyping({
    ttlMs: typingTtlMs,
    broadcast(conversationId, userId, isTyping) {
      conversationsRepository
        .listMemberIds(conversationId)
        .then((memberIds) =>
          emitToUsers(
            memberIds,
            'typing:update',
            { conversationId, userId, typing: isTyping },
            { exceptUserId: userId },
          ),
        )
        .catch((err) => logger.error({ err }, 'typing broadcast failed'));
    },
  });

  // Nobody can be online before the server accepts its first socket.
  await usersRepository.resetAllOffline();

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.request.headers.cookie ?? '');
      const token = cookies[ACCESS_COOKIE];
      const userId = token ? accessTokens.verify(token) : null;
      if (!userId) {
        next(handshakeError('UNAUTHENTICATED'));
        return;
      }
      const active = await refreshTokensRepository.hasActiveForUser(userId, new Date());
      const user = active ? await usersRepository.findById(userId) : null;
      if (!user) {
        next(handshakeError('SESSION_REVOKED'));
        return;
      }
      socket.data.userId = userId;
      next();
    } catch (err) {
      logger.error({ err }, 'socket auth failed');
      next(handshakeError('INTERNAL'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    // Conversation ids this socket may signal typing in. Kept current by conversation.changed.
    socket.data.conversationIds = new Set();
    registry.add(userId, socket);
    const sendWindow = createRateWindow({ max: 20, windowMs: 10_000 });
    const signalWindow = createRateWindow({ max: 40, windowMs: 10_000 });

    presence.connected(userId).catch((err) => logger.error({ err }, 'presence connect failed'));
    conversationsRepository
      .listConversationIds(userId)
      .then((ids) => ids.forEach((id) => socket.data.conversationIds.add(id)))
      .catch((err) => logger.error({ err }, 'failed to load conversations for socket'));

    function reply(ack, payload) {
      if (typeof ack === 'function') {
        ack(payload);
      }
    }

    socket.on('message:send', async (payload, ack) => {
      if (!sendWindow.allow()) {
        reply(ack, {
          ok: false,
          error: { code: 'RATE_LIMITED', message: 'You are sending messages too quickly' },
        });
        return;
      }
      try {
        const { conversationId, ...input } = sendPayload.parse(payload);
        const { message, duplicate } = await messagesService.send(userId, conversationId, input);
        reply(ack, { ok: true, message, duplicate });
      } catch (err) {
        reply(ack, { ok: false, error: toErrorPayload(err, logger) });
      }
    });

    socket.on('message:read', async (payload, ack) => {
      if (!signalWindow.allow()) {
        reply(ack, { ok: false, error: { code: 'RATE_LIMITED', message: 'Slow down' } });
        return;
      }
      try {
        const { conversationId, upToMessageId } = readPayload.parse(payload);
        const result = await messagesService.markRead(userId, conversationId, upToMessageId);
        reply(ack, { ok: true, ...result });
      } catch (err) {
        reply(ack, { ok: false, error: toErrorPayload(err, logger) });
      }
    });

    socket.on('typing', (payload) => {
      if (!signalWindow.allow()) {
        return;
      }
      const parsed = typingPayload.safeParse(payload);
      if (!parsed.success || !socket.data.conversationIds.has(parsed.data.conversationId)) {
        return;
      }
      if (parsed.data.typing) {
        typing.start(parsed.data.conversationId, userId);
      } else {
        typing.stop(parsed.data.conversationId, userId);
      }
    });

    socket.on('disconnect', () => {
      registry.remove(userId, socket);
      if (!registry.isOnline(userId)) {
        typing.stopAllForUser(userId);
      }
      presence.disconnected(userId);
    });
  });

  // Domain events -> sockets --------------------------------------------------------------

  const unsubscribe = [
    events.subscribe('message.created', ({ message, memberIds }) => {
      typing.stop(message.conversationId, message.senderId);
      for (const memberId of memberIds) {
        for (const socket of registry.forUser(memberId)) {
          // The acknowledgement proves the message reached a live client: that is "delivered".
          socket.timeout(ACK_TIMEOUT_MS).emit('message:new', { message }, (err) => {
            if (err || memberId === message.senderId) {
              return;
            }
            messagesService
              .markDelivered(memberId, message.conversationId, message.id)
              .catch((markErr) => logger.error({ err: markErr }, 'markDelivered failed'));
          });
        }
      }
    }),

    events.subscribe('message.updated', ({ message, memberIds }) => {
      emitToUsers(memberIds, 'message:updated', { message });
    }),

    events.subscribe('message.deleted', ({ conversationId, messageId, memberIds }) => {
      emitToUsers(memberIds, 'message:deleted', { conversationId, messageId });
    }),

    events.subscribe('receipt.updated', ({ memberIds, ...receipt }) => {
      emitToUsers(memberIds, 'receipt:update', receipt);
    }),

    events.subscribe(
      'conversation.changed',
      ({ conversationId, userIds, addedUserIds, removedUserIds, reason }) => {
        for (const userId of addedUserIds) {
          for (const socket of registry.forUser(userId)) {
            socket.data.conversationIds?.add(conversationId);
          }
        }
        for (const userId of removedUserIds) {
          for (const socket of registry.forUser(userId)) {
            socket.data.conversationIds?.delete(conversationId);
          }
        }
        for (const userId of new Set([...userIds, ...removedUserIds])) {
          emitToUsers([userId], 'conversation:changed', {
            conversationId,
            reason,
            removed: removedUserIds.includes(userId),
          });
        }
      },
    ),

    events.subscribe('user.updated', async ({ userId }) => {
      const peers = await conversationsRepository.listPeerIds(userId);
      emitToUsers([userId, ...peers], 'user:updated', { userId });
    }),

    events.subscribe('user.sessions-revoked', ({ userId }) => {
      for (const socket of [...registry.forUser(userId)]) {
        socket.disconnect(true);
      }
    }),
  ];

  return {
    io,
    registry,
    close() {
      unsubscribe.forEach((off) => off());
      presence.stop();
      typing.clear();
      // io.close() also closes the underlying HTTP server.
      return new Promise((resolve) => io.close(() => resolve()));
    },
  };
}
