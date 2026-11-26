import { randomUUID } from 'node:crypto';
import { conflict, forbidden, notFound, validationFailed } from '../../utils/errors.js';

const MAX_CALL_MS = 4 * 60 * 60 * 1000;

/**
 * One-to-one voice and video calls. The server never sees media: it only decides who may call
 * whom, keeps the small amount of call state (ringing or active), and tells both sides when the
 * call ends. The browsers set up the connection with each other and exchange their session
 * descriptions through this service (see realtime).
 *
 * Active signaling state lives in memory and does not survive a restart; the call history itself
 * is persisted. Running multiple server instances still needs shared active-call state.
 */
export function createCallsService({
  conversationsRepository,
  usersRepository,
  callsRepository,
  events,
  pushService,
  now = () => new Date(),
  ringMs = 45_000,
  disconnectGraceMs = 8_000,
  logger,
}) {
  const calls = new Map(); // callId -> call
  const byUser = new Map(); // userId -> callId
  const timers = new Map(); // callId -> { ring, max }
  const graceTimers = new Map(); // userId -> timeout

  function clearTimers(callId) {
    const entry = timers.get(callId);
    if (entry) {
      clearTimeout(entry.ring);
      clearTimeout(entry.max);
      timers.delete(callId);
    }
  }

  async function finish(call, reason, endedBy = null) {
    if (!calls.has(call.id)) {
      return null;
    }
    clearTimers(call.id);
    calls.delete(call.id);
    byUser.delete(call.callerId);
    byUser.delete(call.calleeId);
    const ended = { ...call, state: 'ended' };
    try {
      await callsRepository?.finish(call.id, { outcome: reason, endedBy, endedAt: now() });
    } catch (err) {
      logger?.error({ err, callId: call.id }, 'call history update failed');
    }
    events.publish('call.ended', { call: ended, reason, endedBy });
    return ended;
  }

  function require(callId, userId) {
    const call = calls.get(callId);
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
      throw notFound('Call not found');
    }
    return call;
  }

  return {
    /** Start ringing the other person in a direct conversation. */
    async invite(userId, { conversationId, video }) {
      const member = await conversationsRepository.findMember(conversationId, userId);
      if (!member) {
        throw notFound('Conversation not found');
      }
      const conversation = await conversationsRepository.findById(conversationId);
      if (conversation.type !== 'direct') {
        throw validationFailed([
          { path: 'conversationId', message: 'Calls are available in direct chats' },
        ]);
      }
      const calleeId = (await conversationsRepository.listMemberIds(conversationId)).find(
        (id) => id !== userId,
      );
      if (!calleeId) {
        throw notFound('Conversation not found');
      }
      if (byUser.has(userId)) {
        throw conflict('ALREADY_IN_CALL', 'You are already in a call');
      }
      if (byUser.has(calleeId)) {
        throw conflict('USER_BUSY', 'They are on another call');
      }

      const call = {
        id: randomUUID(),
        conversationId,
        callerId: userId,
        calleeId,
        video: Boolean(video),
        state: 'ringing',
        createdAt: now().toISOString(),
        answeredAt: null,
      };
      calls.set(call.id, call);
      byUser.set(userId, call.id);
      byUser.set(calleeId, call.id);
      try {
        await callsRepository?.create({
          id: call.id,
          conversationId,
          callerId: userId,
          calleeId,
          video: call.video,
          startedAt: new Date(call.createdAt),
        });
      } catch (err) {
        logger?.error({ err, callId: call.id }, 'call history creation failed');
      }
      timers.set(call.id, {
        ring: setTimeout(() => {
          const current = calls.get(call.id);
          if (current?.state === 'ringing') {
            finish(current, 'missed').catch((err) =>
              logger?.error({ err, callId: call.id }, 'call end failed'),
            );
          }
        }, ringMs),
        max: setTimeout(
          () =>
            finish(call, 'timeout').catch((err) =>
              logger?.error({ err, callId: call.id }, 'call end failed'),
            ),
          MAX_CALL_MS,
        ),
      });
      timers.get(call.id).ring.unref?.();
      timers.get(call.id).max.unref?.();

      events.publish('call.incoming', { call });
      const caller = await usersRepository.findById(userId);
      pushService
        ?.notifyCall(calleeId, {
          callerName: caller?.displayName ?? 'Someone',
          video: call.video,
          conversationId,
          callId: call.id,
        })
        .catch((err) => logger?.warn({ err }, 'call push failed'));
      return call;
    },

    /** The callee picks up. */
    async accept(userId, callId) {
      const call = require(callId, userId);
      if (call.calleeId !== userId) {
        throw forbidden('NOT_CALLEE', 'Only the person being called can answer');
      }
      if (call.state !== 'ringing') {
        throw conflict('CALL_NOT_RINGING', 'This call is no longer ringing');
      }
      call.state = 'active';
      call.answeredAt = now().toISOString();
      try {
        await callsRepository?.markAnswered(call.id, new Date(call.answeredAt));
      } catch (err) {
        logger?.error({ err, callId: call.id }, 'call markAnswered failed');
      }
      clearTimeout(timers.get(callId)?.ring);
      events.publish('call.accepted', { call });
      return call;
    },

    async history(userId) {
      const rows = await callsRepository?.listForUser(userId, 100);
      const history = rows ?? [];
      const peerIds = [
        ...new Set(history.map((row) => (row.callerId === userId ? row.calleeId : row.callerId))),
      ];
      const peers = await usersRepository.findManyByIds(peerIds);
      const byId = new Map(peers.map((peer) => [peer.id, peer]));
      return history.map((row) => {
        const peer = byId.get(row.callerId === userId ? row.calleeId : row.callerId);
        const answeredAt = row.answeredAt?.toISOString() ?? null;
        const endedAt = row.endedAt?.toISOString() ?? null;
        return {
          id: row.id,
          conversationId: row.conversationId,
          direction: row.callerId === userId ? 'outgoing' : 'incoming',
          video: row.video,
          outcome: row.outcome ?? 'interrupted',
          startedAt: row.startedAt.toISOString(),
          answeredAt,
          endedAt,
          durationSeconds:
            row.answeredAt && row.endedAt
              ? Math.max(0, Math.floor((row.endedAt.getTime() - row.answeredAt.getTime()) / 1000))
              : 0,
          peer: peer
            ? {
                id: peer.id,
                username: peer.username,
                displayName: peer.displayName,
              }
            : null,
        };
      });
    },

    /** Hang up, decline, or cancel. Either side can end it at any time. */
    async end(userId, callId) {
      const call = require(callId, userId);
      const reason =
        call.state === 'ringing' ? (call.callerId === userId ? 'cancelled' : 'declined') : 'ended';
      return finish(call, reason, userId);
    },

    /** Who should receive a signaling message from this user for this call, or throws. */
    peerFor(userId, callId) {
      const call = require(callId, userId);
      return { call, peerId: call.callerId === userId ? call.calleeId : call.callerId };
    },

    /** The call a user is in, if any, so a reconnecting client can resume or ring. */
    current(userId) {
      const id = byUser.get(userId);
      return id ? (calls.get(id) ?? null) : null;
    },

    /**
     * Called when a user loses their last socket. If they do not come back within the grace period
     * the call ends, so nobody is left ringing or talking to nobody.
     */
    userOffline(userId) {
      const call = this.current(userId);
      if (!call) {
        return;
      }
      clearTimeout(graceTimers.get(userId));
      const timer = setTimeout(() => {
        graceTimers.delete(userId);
        const still = this.current(userId);
        if (still) {
          finish(still, 'dropped', userId).catch((err) =>
            logger?.error({ err, callId: still.id }, 'call end failed'),
          );
        }
      }, disconnectGraceMs);
      timer.unref?.();
      graceTimers.set(userId, timer);
    },

    userOnline(userId) {
      clearTimeout(graceTimers.get(userId));
      graceTimers.delete(userId);
    },

    /** Used by tests and shutdown. */
    stop() {
      for (const id of [...timers.keys()]) {
        clearTimers(id);
      }
      for (const timer of graceTimers.values()) {
        clearTimeout(timer);
      }
      graceTimers.clear();
      calls.clear();
      byUser.clear();
    },
  };
}
