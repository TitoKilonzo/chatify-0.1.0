import { io as connectClient } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  connectSocket,
  createClient,
  createTestApp,
  emitAck,
  expectSilence,
  signUp,
  startRealtime,
  waitFor,
} from './helpers/test-app.js';
import { buildIceServers } from '../src/modules/calls/ice.js';
import { testEnv } from './helpers/test-env.js';

describe('calls', () => {
  let ctx;
  let server;
  const sockets = [];
  const pushes = [];

  beforeAll(async () => {
    ctx = await createTestApp(
      {
        VAPID_PUBLIC_KEY: 'BPublicKeyForTests',
        VAPID_PRIVATE_KEY: 'PrivateKeyForTests',
        VAPID_SUBJECT: 'mailto:ops@example.com',
      },
      {
        callsOptions: { ringMs: 400, disconnectGraceMs: 300 },
        pushSender: async (subscription, payload) => pushes.push({ subscription, payload }),
      },
    );
    server = await startRealtime(ctx);
  });
  afterEach(() => {
    while (sockets.length) {
      sockets.pop().close();
    }
    ctx.container.callsService.stop();
    pushes.length = 0;
  });
  afterAll(async () => {
    await server.close();
    await ctx.cleanup();
  });

  async function connect(user) {
    const socket = await connectSocket(server.url, user.cookie);
    sockets.push(socket);
    return socket;
  }

  async function pair() {
    const [a, b] = await Promise.all([signUp(ctx.app, 'ca'), signUp(ctx.app, 'cb')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  /** Both people connected, a call started by a, and b's incoming notice received. */
  async function ringing(video = false) {
    const { a, b, id } = await pair();
    const [sa, sb] = [await connect(a), await connect(b)];
    const incoming = waitFor(sb, 'call:incoming');
    const res = await emitAck(sa, 'call:invite', { conversationId: id, video });
    expect(res.ok).toBe(true);
    const { call } = await incoming;
    return { a, b, id, sa, sb, call };
  }

  describe('ringing and answering', () => {
    it('rings the other person and carries the video flag', async () => {
      const { a, call } = await ringing(true);
      expect(call).toEqual(
        expect.objectContaining({ callerId: a.id, video: true, state: 'ringing' }),
      );
    });

    it('connects when answered and tells both sides', async () => {
      const { sa, sb, call } = await ringing();
      const onCaller = waitFor(sa, 'call:accepted');
      const onCallee = waitFor(sb, 'call:accepted');
      expect((await emitAck(sb, 'call:accept', { callId: call.id })).ok).toBe(true);
      expect((await onCaller).call.state).toBe('active');
      expect((await onCallee).call.answeredAt).toEqual(expect.any(String));
    });

    it('only lets the callee answer', async () => {
      const { sa, call } = await ringing();
      const res = await emitAck(sa, 'call:accept', { callId: call.id });
      expect(res.ok).toBe(false);
      expect(res.error.code).toBe('NOT_CALLEE');
    });

    it('lets the callee decline and the caller cancel', async () => {
      const declined = await ringing();
      const endedForCaller = waitFor(declined.sa, 'call:ended');
      await emitAck(declined.sb, 'call:end', { callId: declined.call.id });
      expect((await endedForCaller).reason).toBe('declined');

      const cancelled = await ringing();
      const endedForCallee = waitFor(cancelled.sb, 'call:ended');
      await emitAck(cancelled.sa, 'call:end', { callId: cancelled.call.id });
      expect((await endedForCallee).reason).toBe('cancelled');
    }, 15_000);

    it('ends an unanswered call as missed', async () => {
      const { sa, sb } = await ringing();
      const [forCaller, forCallee] = await Promise.all([
        waitFor(sa, 'call:ended', { timeoutMs: 2000 }),
        waitFor(sb, 'call:ended', { timeoutMs: 2000 }),
      ]);
      expect(forCaller.reason).toBe('missed');
      expect(forCallee.reason).toBe('missed');
    });

    it('rings a callee who opens the app while it is ringing', async () => {
      const { a, b, id } = await pair();
      const sa = await connect(a);
      await emitAck(sa, 'call:invite', { conversationId: id });
      // The notice is sent as soon as the socket connects, so listen before connecting.
      const sb = connectClient(server.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: { cookie: b.cookie },
      });
      sockets.push(sb);
      const notice = await waitFor(sb, 'call:incoming');
      expect(notice.call.callerId).toBe(a.id);
    });
  });

  describe('rules', () => {
    it('refuses a second call for either person', async () => {
      const { a, b, id } = await pair();
      const third = await signUp(ctx.app, 'cc');
      const dm = await third.client.post('/api/conversations/direct', { userId: b.id });
      const sa = await connect(a);
      const sb = await connect(b);
      const sc = await connect(third);
      const incoming = waitFor(sb, 'call:incoming');
      const started = await emitAck(sa, 'call:invite', { conversationId: id });
      expect(started.ok).toBe(true);
      await incoming;
      const again = await emitAck(sa, 'call:invite', { conversationId: id });
      expect(again.error.code).toBe('ALREADY_IN_CALL');

      const busy = await emitAck(sc, 'call:invite', { conversationId: dm.body.conversation.id });
      expect(busy.error.code).toBe('USER_BUSY');
      expect(a.id).not.toBe(b.id);
      expect(sb.connected).toBe(true);
    }, 15_000);

    it('does not allow calls in groups or for non-members', async () => {
      const [a, b, c] = await Promise.all([
        signUp(ctx.app, 'ga'),
        signUp(ctx.app, 'gb'),
        signUp(ctx.app, 'gc'),
      ]);
      const group = (
        await a.client.post('/api/conversations/group', { name: 'Team', memberIds: [b.id] })
      ).body.conversation;
      const sa = await connect(a);
      const inGroup = await emitAck(sa, 'call:invite', { conversationId: group.id });
      expect(inGroup.error.code).toBe('VALIDATION_FAILED');

      const sc = await connect(c);
      const outsider = await emitAck(sc, 'call:invite', { conversationId: group.id });
      expect(outsider.error.code).toBe('NOT_FOUND');
    });

    it('rejects malformed requests', async () => {
      const { a } = await pair();
      const sa = await connect(a);
      expect((await emitAck(sa, 'call:invite', { conversationId: 'nope' })).ok).toBe(false);
      expect((await emitAck(sa, 'call:accept', {})).ok).toBe(false);
    });
  });

  describe('signaling', () => {
    it('relays descriptions and candidates to the other side only', async () => {
      const { sa, sb, call } = await ringing();
      await emitAck(sb, 'call:accept', { callId: call.id });

      const gotOffer = waitFor(sb, 'call:signal');
      const offer = { description: { type: 'offer', sdp: 'v=0' } };
      expect((await emitAck(sa, 'call:signal', { callId: call.id, data: offer })).ok).toBe(true);
      expect((await gotOffer).data).toEqual(offer);

      const gotCandidate = waitFor(sa, 'call:signal');
      const candidate = { candidate: { candidate: 'candidate:1 1 udp', sdpMid: '0' } };
      await emitAck(sb, 'call:signal', { callId: call.id, data: candidate });
      expect((await gotCandidate).data.candidate.sdpMid).toBe('0');
      expect(await expectSilence(sa, 'call:signal')).toBe(true);
    });

    it('does not relay for strangers or malformed data', async () => {
      const { sa, call } = await ringing();
      const stranger = await signUp(ctx.app, 'cs');
      const ss = await connect(stranger);
      const denied = await emitAck(ss, 'call:signal', {
        callId: call.id,
        data: { description: { type: 'offer', sdp: 'v=0' } },
      });
      expect(denied.error.code).toBe('NOT_FOUND');
      const bad = await emitAck(sa, 'call:signal', {
        callId: call.id,
        data: { description: { type: 'rollback', sdp: 'x' } },
      });
      expect(bad.ok).toBe(false);
    });

    it('stops signaling once the call has ended', async () => {
      const { sa, call } = await ringing();
      await emitAck(sa, 'call:end', { callId: call.id });
      const late = await emitAck(sa, 'call:signal', {
        callId: call.id,
        data: { candidate: null },
      });
      expect(late.error.code).toBe('NOT_FOUND');
    });
  });

  describe('connection loss', () => {
    it('ends the call after the grace period when someone drops', async () => {
      const { sa, sb, call } = await ringing();
      await emitAck(sb, 'call:accept', { callId: call.id });
      const ended = waitFor(sa, 'call:ended', { timeoutMs: 2000 });
      sb.close();
      const notice = await ended;
      expect(notice.reason).toBe('dropped');
    });

    it('keeps the call if they reconnect in time', async () => {
      const { b, sa, sb, call } = await ringing();
      await emitAck(sb, 'call:accept', { callId: call.id });
      sb.close();
      const again = await connect(b);
      expect(again.connected).toBe(true);
      expect(await expectSilence(sa, 'call:ended', 700)).toBe(true);
    });
  });

  describe('notifications', () => {
    it('pushes to subscribed devices when the callee has the app open elsewhere', async () => {
      const { a, b, id } = await pair();
      const saved = await b.client.post('/api/push/subscriptions', {
        endpoint: 'https://push.example.com/send/call-1',
        keys: { p256dh: 'p256dh-call', auth: 'auth-call' },
      });
      expect(saved.status).toBeLessThan(300);
      const sa = await connect(a);
      const sb = await connect(b);
      const incoming = waitFor(sb, 'call:incoming');
      await emitAck(sa, 'call:invite', { conversationId: id, video: true });
      await incoming;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(pushes.some((p) => String(p.payload).includes('Incoming video call'))).toBe(true);
    });
  });

  describe('history', () => {
    it('stores calls for both participants and does not expose them to strangers', async () => {
      const { a, b, sa, sb, call } = await ringing(true);
      await emitAck(sb, 'call:end', { callId: call.id });

      const callerHistory = await a.client.get('/api/calls/history');
      const calleeHistory = await b.client.get('/api/calls/history');
      expect(callerHistory.body.calls).toHaveLength(1);
      expect(callerHistory.body.calls[0]).toMatchObject({
        id: call.id,
        direction: 'outgoing',
        outcome: 'declined',
        video: true,
        peer: { id: b.id, displayName: b.user.displayName },
      });
      expect(calleeHistory.body.calls[0]).toMatchObject({
        id: call.id,
        direction: 'incoming',
        outcome: 'declined',
        peer: { id: a.id, displayName: a.user.displayName },
      });
      expect(callerHistory.body.calls[0].peer).not.toHaveProperty('passwordHash');

      const stranger = await signUp(ctx.app, 'history');
      expect((await stranger.client.get('/api/calls/history')).body.calls).toEqual([]);
      expect(sa.connected).toBe(true);
    });

    it('requires sign-in', async () => {
      const res = await createClient(ctx.app).get('/api/calls/history');
      expect(res.status).toBe(401);
    });
  });

  describe('ICE configuration', () => {
    it('serves STUN by default and requires sign-in', async () => {
      const user = await signUp(ctx.app, 'ice');
      const res = await user.client.get('/api/calls/ice');
      expect(res.status).toBe(200);
      expect(res.body.iceServers).toEqual([{ urls: ['stun:stun.l.google.com:19302'] }]);
      expect((await createClient(ctx.app).get('/api/calls/ice')).status).toBe(401);
    });

    it('adds short-lived TURN credentials when configured', () => {
      const env = testEnv({
        TURN_URLS: 'turn:relay.example.com:3478, turns:relay.example.com:5349',
        TURN_SECRET: 'turn-secret',
        TURN_TTL_SECONDS: '600',
      });
      const now = new Date('2026-01-01T00:00:00Z');
      const [, turn] = buildIceServers(env, 'user-1', now);
      expect(turn.urls).toEqual(['turn:relay.example.com:3478', 'turns:relay.example.com:5349']);
      expect(turn.username).toBe(`${Math.floor(now.getTime() / 1000) + 600}:user-1`);
      expect(turn.credential).toMatch(/^[A-Za-z0-9+/]+=*$/);
      // Different users never share a credential.
      expect(buildIceServers(env, 'user-2', now)[1].credential).not.toBe(turn.credential);
    });

    it('refuses TURN servers without a secret', () => {
      expect(() => testEnv({ TURN_URLS: 'turn:relay.example.com' })).toThrow(/TURN_SECRET/);
    });
  });
});
