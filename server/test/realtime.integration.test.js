import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as connectClient } from 'socket.io-client';
import {
  connectSocket,
  createTestApp,
  emitAck,
  expectSilence,
  signUp,
  startRealtime,
  waitFor,
} from './helpers/test-app.js';

describe('realtime', () => {
  let ctx;
  let server;
  const sockets = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    server = await startRealtime(ctx);
  });
  afterEach(() => {
    while (sockets.length) {
      sockets.pop().close();
    }
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
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  let seq = 0;
  const cid = () => `rt-client-${Date.now()}-${(seq += 1)}`;

  describe('handshake', () => {
    it('rejects sockets without a session cookie', async () => {
      await expect(connectSocket(server.url, '')).rejects.toThrow('UNAUTHENTICATED');
    });

    it('rejects a forged access token', async () => {
      await expect(connectSocket(server.url, 'chatify_at=not.a.jwt')).rejects.toThrow(
        'UNAUTHENTICATED',
      );
    });

    it('rejects a disallowed browser origin', async () => {
      const { a } = await pair();
      const socket = connectClient(server.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: { cookie: a.cookie, origin: 'https://evil.example' },
      });
      const err = await new Promise((resolve) => socket.once('connect_error', resolve));
      socket.close();
      expect(err).toBeTruthy();
    });

    it('accepts the configured origin', async () => {
      const { a } = await pair();
      const socket = connectClient(server.url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: { cookie: a.cookie, origin: ctx.env.CORS_ORIGINS[0] },
      });
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      sockets.push(socket);
      expect(socket.connected).toBe(true);
    });

    it('refuses a user whose sessions were all revoked', async () => {
      const user = await signUp(ctx.app);
      await user.client.post('/api/auth/logout', {});
      await expect(connectSocket(server.url, user.cookie)).rejects.toThrow('SESSION_REVOKED');
    });
  });

  describe('messaging', () => {
    it('delivers a message to the other client in real time and acks the sender', async () => {
      const { a, b, id } = await pair();
      const [sa, sb] = await Promise.all([connect(a), connect(b)]);

      const incoming = waitFor(sb, 'message:new');
      const ack = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: 'hello over the wire',
      });
      expect(ack.ok).toBe(true);
      expect(ack.message.body).toBe('hello over the wire');

      const { message } = await incoming;
      expect(message.id).toBe(ack.message.id);
      expect(message.senderId).toBe(a.id);
    });

    it('marks the message delivered once the recipient socket acknowledges it', async () => {
      const { a, b, id } = await pair();
      const [sa, sb] = await Promise.all([connect(a), connect(b)]);
      // A real client acknowledges each message:new; that acknowledgement is what means delivered.
      sb.on('message:new', (_payload, ack) => ack?.());

      const receipt = waitFor(sa, 'receipt:update', {
        predicate: (r) => r.state === 'delivered',
      });
      const ack = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: 'deliver me',
      });
      const update = await receipt;
      expect(update).toMatchObject({ conversationId: id, userId: b.id, state: 'delivered' });
      expect(update.upToMessageId).toBeGreaterThanOrEqual(ack.message.id);
    });

    it('sends a read receipt to the author when the recipient reads', async () => {
      const { a, b, id } = await pair();
      const [sa, sb] = await Promise.all([connect(a), connect(b)]);
      const arrived = waitFor(sb, 'message:new');
      const ack = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: 'read me',
      });
      await arrived;

      const read = waitFor(sa, 'receipt:update', { predicate: (r) => r.state === 'read' });
      const result = await emitAck(sb, 'message:read', {
        conversationId: id,
        upToMessageId: ack.message.id,
      });
      expect(result).toMatchObject({ ok: true, unreadCount: 0 });
      expect(await read).toMatchObject({ userId: b.id, upToMessageId: ack.message.id });

      const history = await a.client.get(`/api/conversations/${id}/messages`);
      expect(history.body.messages[0].receipts[0].state).toBe('read');
    });

    it("syncs read state across the same user's tabs", async () => {
      const { a, b, id } = await pair();
      const [sa, sb1, sb2] = await Promise.all([connect(a), connect(b), connect(b)]);
      const ack = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: 'multi tab',
      });
      const otherTab = waitFor(sb2, 'receipt:update', { predicate: (r) => r.state === 'read' });
      await emitAck(sb1, 'message:read', { conversationId: id, upToMessageId: ack.message.id });
      expect((await otherTab).userId).toBe(b.id);
    });

    it('is idempotent when the same clientId is sent twice (retry after a lost ack)', async () => {
      const { a, id } = await pair();
      const sa = await connect(a);
      const payload = { conversationId: id, clientId: cid(), body: 'retry me' };
      const first = await emitAck(sa, 'message:send', payload);
      const second = await emitAck(sa, 'message:send', payload);
      expect(second.ok).toBe(true);
      expect(second.duplicate).toBe(true);
      expect(second.message.id).toBe(first.message.id);
      const history = await a.client.get(`/api/conversations/${id}/messages`);
      expect(history.body.messages).toHaveLength(1);
    });

    it('returns structured errors in the ack for invalid payloads', async () => {
      const { a, id } = await pair();
      const sa = await connect(a);
      const bad = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: 'x',
        body: 'y',
      });
      expect(bad.ok).toBe(false);
      expect(bad.error.code).toBe('VALIDATION_FAILED');
      const empty = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: '   ',
      });
      expect(empty.error.code).toBe('VALIDATION_FAILED');
      const junk = await emitAck(sa, 'message:send', 'not an object');
      expect(junk.error.code).toBe('VALIDATION_FAILED');
    });

    it('rate limits a socket that floods messages', async () => {
      const { a, id } = await pair();
      const sa = await connect(a);
      const results = [];
      for (let i = 0; i < 25; i += 1) {
        results.push(
          await emitAck(sa, 'message:send', { conversationId: id, clientId: cid(), body: `f${i}` }),
        );
      }
      expect(results.filter((r) => r.ok)).toHaveLength(20);
      expect(results.find((r) => !r.ok).error.code).toBe('RATE_LIMITED');
    });

    it('fans out edits and deletions to every member', async () => {
      const { a, b, id } = await pair();
      const [sa, sb] = await Promise.all([connect(a), connect(b)]);
      const ack = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: 'draft',
      });
      const updated = waitFor(sb, 'message:updated');
      await a.client.patch(`/api/messages/${ack.message.id}`, { body: 'final' });
      expect((await updated).message.body).toBe('final');

      const deleted = waitFor(sb, 'message:deleted');
      await a.client.delete(`/api/messages/${ack.message.id}`);
      expect(await deleted).toMatchObject({ conversationId: id, messageId: ack.message.id });
    });

    it('also delivers messages sent over HTTP to connected clients', async () => {
      const { a, b, id } = await pair();
      const sb = await connect(b);
      const incoming = waitFor(sb, 'message:new');
      await a.client.post(`/api/conversations/${id}/messages`, {
        clientId: cid(),
        body: 'via http',
      });
      expect((await incoming).message.body).toBe('via http');
    });
  });

  describe('isolation', () => {
    it('never delivers messages or typing to non-members', async () => {
      const { a, id } = await pair();
      const outsider = await signUp(ctx.app, 'outsider');
      const [sa, so] = await Promise.all([connect(a), connect(outsider)]);

      const quietMessages = expectSilence(so, 'message:new');
      const quietTyping = expectSilence(so, 'typing:update');
      const quietReceipts = expectSilence(so, 'receipt:update');
      sa.emit('typing', { conversationId: id, typing: true });
      await emitAck(sa, 'message:send', { conversationId: id, clientId: cid(), body: 'secret' });
      expect(await quietMessages).toBe(true);
      expect(await quietTyping).toBe(true);
      expect(await quietReceipts).toBe(true);
    });

    it('lets a non-member neither send, read-mark, nor type into a conversation', async () => {
      const { a, id } = await pair();
      const outsider = await signUp(ctx.app, 'outsider');
      const [sa, so] = await Promise.all([connect(a), connect(outsider)]);

      const send = await emitAck(so, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: 'intrusion',
      });
      expect(send).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
      const read = await emitAck(so, 'message:read', { conversationId: id });
      expect(read).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

      const typingHeard = expectSilence(sa, 'typing:update');
      so.emit('typing', { conversationId: id, typing: true });
      expect(await typingHeard).toBe(true);

      const history = await a.client.get(`/api/conversations/${id}/messages`);
      expect(history.body.messages).toHaveLength(0);
    });

    it('stops delivering to a member who was removed from a group', async () => {
      const [owner, member] = await Promise.all([signUp(ctx.app), signUp(ctx.app)]);
      const created = await owner.client.post('/api/conversations/group', {
        name: 'Temp',
        memberIds: [member.id],
      });
      const id = created.body.conversation.id;
      const [so, sm] = await Promise.all([connect(owner), connect(member)]);

      const removed = waitFor(sm, 'conversation:changed', { predicate: (p) => p.removed });
      await owner.client.delete(`/api/conversations/${id}/members/${member.id}`);
      expect(await removed).toMatchObject({ conversationId: id, removed: true });

      const quiet = expectSilence(sm, 'message:new');
      await emitAck(so, 'message:send', { conversationId: id, clientId: cid(), body: 'after' });
      expect(await quiet).toBe(true);

      const typingHeard = expectSilence(so, 'typing:update');
      sm.emit('typing', { conversationId: id, typing: true });
      expect(await typingHeard).toBe(true);
    });

    it('notifies a newly added member and lets them type immediately', async () => {
      const [owner, member] = await Promise.all([signUp(ctx.app), signUp(ctx.app)]);
      const other = await signUp(ctx.app);
      const created = await owner.client.post('/api/conversations/group', {
        name: 'Grow',
        memberIds: [other.id],
      });
      const id = created.body.conversation.id;
      const [so, sm] = await Promise.all([connect(owner), connect(member)]);

      const added = waitFor(sm, 'conversation:changed');
      await owner.client.post(`/api/conversations/${id}/members`, { userIds: [member.id] });
      expect(await added).toMatchObject({ conversationId: id, removed: false });

      const typingSeen = waitFor(so, 'typing:update');
      sm.emit('typing', { conversationId: id, typing: true });
      expect(await typingSeen).toMatchObject({ userId: member.id, typing: true });
    });
  });

  describe('typing', () => {
    it('broadcasts start, then expires on its own', async () => {
      const { a, b, id } = await pair();
      const [sa, sb] = await Promise.all([connect(a), connect(b)]);
      const started = waitFor(sb, 'typing:update', { predicate: (p) => p.typing });
      sa.emit('typing', { conversationId: id, typing: true });
      expect(await started).toMatchObject({ conversationId: id, userId: a.id, typing: true });
      const stopped = waitFor(sb, 'typing:update', { predicate: (p) => !p.typing });
      expect(await stopped).toMatchObject({ userId: a.id, typing: false });
    });

    it('clears typing immediately when the message is sent', async () => {
      const { a, b, id } = await pair();
      const [sa, sb] = await Promise.all([connect(a), connect(b)]);
      const started = waitFor(sb, 'typing:update', { predicate: (p) => p.typing });
      sa.emit('typing', { conversationId: id, typing: true });
      await started;
      const stopped = waitFor(sb, 'typing:update', { predicate: (p) => !p.typing, timeoutMs: 200 });
      await emitAck(sa, 'message:send', { conversationId: id, clientId: cid(), body: 'done' });
      expect((await stopped).typing).toBe(false);
    });

    it('does not echo typing back to the typist', async () => {
      const { a, id } = await pair();
      const sa = await connect(a);
      const quiet = expectSilence(sa, 'typing:update');
      sa.emit('typing', { conversationId: id, typing: true });
      expect(await quiet).toBe(true);
    });
  });

  describe('presence', () => {
    it('broadcasts online and, after the grace period, offline to peers', async () => {
      const { a, b } = await pair();
      const sa = await connect(a);
      const online = waitFor(sa, 'presence:update', {
        predicate: (p) => p.userId === b.id && p.status === 'online',
      });
      const sb = await connect(b);
      expect(await online).toMatchObject({ userId: b.id, status: 'online' });
      const stored = await ctx.container.usersRepository.findById(b.id);
      expect(stored.status).toBe('online');

      const offline = waitFor(sa, 'presence:update', {
        predicate: (p) => p.userId === b.id && p.status === 'offline',
      });
      sb.close();
      const update = await offline;
      expect(update.lastSeenAt).toBeTruthy();
      expect((await ctx.container.usersRepository.findById(b.id)).status).toBe('offline');
    });

    it('stays online while another tab is open', async () => {
      const { a, b } = await pair();
      const sa = await connect(a);
      const online = waitFor(sa, 'presence:update', {
        predicate: (p) => p.userId === b.id && p.status === 'online',
      });
      const [sb1] = await Promise.all([connect(b), connect(b)]);
      await online;
      const quiet = expectSilence(sa, 'presence:update', 600);
      sb1.close();
      expect(await quiet).toBe(true);
      expect((await ctx.container.usersRepository.findById(b.id)).status).toBe('online');
    });

    it('does not flicker offline across a quick reconnect', async () => {
      const { a, b } = await pair();
      const sa = await connect(a);
      const online = waitFor(sa, 'presence:update', {
        predicate: (p) => p.userId === b.id && p.status === 'online',
      });
      const sb = await connect(b);
      await online;
      const quiet = expectSilence(sa, 'presence:update', 700);
      sb.close();
      await connect(b);
      expect(await quiet).toBe(true);
    });
  });

  describe('session revocation', () => {
    it('disconnects sockets on logout and refuses reconnection', async () => {
      const user = await signUp(ctx.app);
      const socket = await connect(user);
      const closed = new Promise((resolve) => socket.once('disconnect', resolve));
      await user.client.post('/api/auth/logout', {});
      expect(await closed).toBe('io server disconnect');
      await expect(connectSocket(server.url, user.cookie)).rejects.toThrow('SESSION_REVOKED');
    });

    it('disconnects sockets when the password changes', async () => {
      const user = await signUp(ctx.app);
      const socket = await connect(user);
      const closed = new Promise((resolve) => socket.once('disconnect', resolve));
      const res = await user.client.post('/api/users/me/password', {
        currentPassword: user.credentials.password,
        newPassword: 'a brand new passphrase',
      });
      expect(res.status).toBe(204);
      expect(await closed).toBe('io server disconnect');
    });
  });

  describe('reconnect without loss or duplicates', () => {
    it('catches up on everything missed while offline via sync, exactly once', async () => {
      const { a, b, id } = await pair();
      const sa = await connect(a);
      let sb = await connect(b);

      const seen = new Map();
      sb.on('message:new', ({ message }) => seen.set(message.id, message));
      const arrived = waitFor(sb, 'message:new');
      const first = await emitAck(sa, 'message:send', {
        conversationId: id,
        clientId: cid(),
        body: 'm1',
      });
      await arrived;
      const lastSeenId = first.message.id;

      sb.close();
      for (const body of ['m2', 'm3', 'm4']) {
        await emitAck(sa, 'message:send', { conversationId: id, clientId: cid(), body });
      }

      sb = await connect(b);
      sb.on('message:new', ({ message }) => seen.set(message.id, message));
      const sync = await b.client.get(`/api/sync?afterId=${lastSeenId}`);
      for (const message of sync.body.messages) {
        seen.set(message.id, message);
      }
      expect([...seen.values()].map((m) => m.body)).toEqual(['m1', 'm2', 'm3', 'm4']);

      // A repeat sync returns the same messages: the client merges by id, so nothing duplicates.
      const again = await b.client.get(`/api/sync?afterId=${lastSeenId}`);
      for (const message of again.body.messages) {
        seen.set(message.id, message);
      }
      expect(seen.size).toBe(4);
    });
  });
});
