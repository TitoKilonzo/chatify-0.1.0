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
 * Web Push for subscribed browsers. The service worker suppresses notifications for a focused app
 * window; this lets a background browser/device receive alerts even when another device is online.
 * Muted conversations are still respected, and gone endpoints are removed.
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
  const send =
    sender ??
    (enabled
      ? (subscription, payload, ttl) =>
          sendNotification(subscription, payload, {
            vapidDetails: {
              subject: env.VAPID_SUBJECT,
              publicKey: env.VAPID_PUBLIC_KEY,
              privateKey: env.VAPID_PRIVATE_KEY,
            },
            TTL: ttl,
            urgency: 'normal',
          })
      : null);

  async function deliver(row, payload, ttl = 60 * 60) {
    try {
      await send(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        ttl,
      );
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
    const candidates = memberIds.filter((id) => id !== message.senderId);
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

    /** Alert subscribed devices while the call is ringing. */
    async notifyCall(userId, { callerName, video, conversationId, callId }) {
      if (!send) {
        return;
      }
      const subscriptions = await repository.listForUsers([userId]);
      const payload = JSON.stringify({
        title: callerName,
        body: video ? 'Incoming video call' : 'Incoming voice call',
        conversationId,
        url: `/chats/${conversationId}`,
        kind: 'call',
        callId,
        tag: `call-${callId}`,
      });
      await Promise.all(subscriptions.map((row) => deliver(row, payload, 45)));
    },
  };
}
