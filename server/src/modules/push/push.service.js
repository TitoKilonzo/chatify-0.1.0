import { sendNotification } from 'web-push';

const BODY_LENGTH = 120;

function describe(message) {
  if (message.encrypted) {
    return 'New encrypted message';
  }
  if (message.attachment) {
    const kind = message.attachment.kind;
    const label = kind === 'voice' ? 'a voice note' : kind === 'image' ? 'a photo' : 'a file';
    return message.body ? message.body.slice(0, BODY_LENGTH) : `Sent ${label}`;
  }
  return message.body.slice(0, BODY_LENGTH);
}

/**
 * Web Push for people who are not connected. Subscriptions are stored per browser; a message
 * notifies members who have no live socket and have not muted the conversation. The push service
 * reports gone endpoints (404 or 410) and those are deleted so they are never tried again.
 *
 * sender is injectable for tests; by default it is the web-push library configured with VAPID keys.
 */
export function createPushService({
  env,
  repository,
  conversationsRepository,
  events,
  logger,
  sender,
}) {
  const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  let isOnline = () => false;

  const send =
    sender ??
    (enabled
      ? (subscription, payload) =>
          sendNotification(subscription, payload, {
            vapidDetails: {
              subject: env.VAPID_SUBJECT,
              publicKey: env.VAPID_PUBLIC_KEY,
              privateKey: env.VAPID_PRIVATE_KEY,
            },
            TTL: 60 * 60,
            urgency: 'normal',
          })
      : null);

  async function deliver(row, payload) {
    try {
      await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await repository.removeByEndpoint(row.endpoint);
      } else {
        logger.warn({ err: { statusCode: err?.statusCode, message: err?.message } }, 'push failed');
      }
    }
  }

  async function notify({ message, memberIds }) {
    if (!send) {
      return;
    }
    const candidates = memberIds.filter((id) => id !== message.senderId && !isOnline(id));
    if (candidates.length === 0) {
      return;
    }
    const subscriptions = await repository.listForUsers(candidates);
    if (subscriptions.length === 0) {
      return;
    }
    const members = await conversationsRepository.listMembers(message.conversationId);
    const muted = new Set(
      members.filter(({ member }) => member.mutedAt).map(({ member }) => member.userId),
    );
    const sender = members.find(({ user }) => user.id === message.senderId)?.user;
    const senderName = sender?.displayName ?? 'Someone';
    const conversation = await conversationsRepository.findById(message.conversationId);
    const isGroup = conversation?.type === 'group';
    const payload = JSON.stringify({
      title: isGroup ? (conversation.name ?? 'Group') : senderName,
      body: isGroup ? `${senderName}: ${describe(message)}` : describe(message),
      conversationId: message.conversationId,
      url: `/${isGroup ? 'groups' : 'chats'}/${message.conversationId}`,
      tag: message.conversationId,
    });
    await Promise.all(
      subscriptions.filter((row) => !muted.has(row.userId)).map((row) => deliver(row, payload)),
    );
  }

  return {
    enabled,
    publicKey: enabled ? env.VAPID_PUBLIC_KEY : null,

    /** Realtime tells the service which users have a live socket (they do not need a push). */
    setOnlineCheck(fn) {
      isOnline = fn;
    },

    start() {
      return events.subscribe('message.created', notify);
    },

    async subscribe(userId, { endpoint, keys }, userAgent) {
      await repository.upsert({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent?.slice(0, 200),
      });
    },

    async unsubscribe(userId, endpoint) {
      await repository.removeForUser(userId, endpoint);
    },

    notify,
  };
}
