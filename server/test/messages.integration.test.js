import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers/test-app.js';

describe('messages', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  let seq = 0;
  const clientId = () => `client-${Date.now()}-${(seq += 1)}`;

  async function pair() {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  const send = (user, id, body, extra = {}) =>
    user.client.post(`/api/conversations/${id}/messages`, { clientId: clientId(), body, ...extra });

  it('sends a message and returns it with receipts for the recipient', async () => {
    const { a, b, id } = await pair();
    const res = await send(a, id, '  hello there  ');
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({
      conversationId: id,
      senderId: a.id,
      body: 'hello there',
      attachment: null,
      editedAt: null,
      deletedAt: null,
    });
    expect(res.body.message.receipts).toEqual([{ userId: b.id, state: 'sent' }]);
  });

  it('rejects empty and oversized bodies and bad client ids', async () => {
    const { a, id } = await pair();
    expect((await send(a, id, '   ')).status).toBe(400);
    expect((await send(a, id, 'x'.repeat(4001))).status).toBe(400);
    const badId = await a.client.post(`/api/conversations/${id}/messages`, {
      clientId: 'bad id!',
      body: 'x',
    });
    expect(badId.status).toBe(400);
  });

  it('is idempotent for a repeated clientId', async () => {
    const { a, id } = await pair();
    const cid = clientId();
    const first = await a.client.post(`/api/conversations/${id}/messages`, {
      clientId: cid,
      body: 'once',
    });
    const second = await a.client.post(`/api/conversations/${id}/messages`, {
      clientId: cid,
      body: 'once',
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.message.id).toBe(first.body.message.id);
    const history = await a.client.get(`/api/conversations/${id}/messages`);
    expect(history.body.messages).toHaveLength(1);
  });

  it('pages history oldest-first with a stable cursor and no gaps or duplicates', async () => {
    const { a, id } = await pair();
    for (let i = 1; i <= 25; i += 1) {
      await send(a, id, `m${i}`);
    }
    const page1 = await a.client.get(`/api/conversations/${id}/messages?limit=10`);
    expect(page1.body.messages.map((m) => m.body)).toEqual(
      Array.from({ length: 10 }, (_, i) => `m${16 + i}`),
    );
    expect(page1.body.hasMore).toBe(true);

    const page2 = await a.client.get(
      `/api/conversations/${id}/messages?limit=10&before=${page1.body.nextCursor}`,
    );
    expect(page2.body.messages.map((m) => m.body)).toEqual(
      Array.from({ length: 10 }, (_, i) => `m${6 + i}`),
    );

    const page3 = await a.client.get(
      `/api/conversations/${id}/messages?limit=10&before=${page2.body.nextCursor}`,
    );
    expect(page3.body.messages.map((m) => m.body)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(page3.body.hasMore).toBe(false);
    expect(page3.body.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor', async () => {
    const { a, id } = await pair();
    const res = await a.client.get(`/api/conversations/${id}/messages?before=garbage`);
    expect(res.status).toBe(400);
  });

  it('counts unread per user and clears them when read', async () => {
    const { a, b, id } = await pair();
    await send(a, id, 'one');
    await send(a, id, 'two');
    await send(a, id, 'three');

    const senderList = await a.client.get('/api/conversations');
    expect(senderList.body.conversations[0].unreadCount).toBe(0);
    const recipientList = await b.client.get('/api/conversations');
    expect(recipientList.body.conversations[0].unreadCount).toBe(3);
    expect(recipientList.body.conversations[0].lastMessage.body).toBe('three');

    const partial = await b.client.get(`/api/conversations/${id}/messages`);
    const secondId = partial.body.messages[1].id;
    const readSome = await b.client.post(`/api/conversations/${id}/read`, {
      upToMessageId: secondId,
    });
    expect(readSome.body.unreadCount).toBe(1);

    const readAll = await b.client.post(`/api/conversations/${id}/read`, {});
    expect(readAll.body.unreadCount).toBe(0);

    // Reading never moves backwards.
    const backwards = await b.client.post(`/api/conversations/${id}/read`, {
      upToMessageId: secondId,
    });
    expect(backwards.body.unreadCount).toBe(0);
  });

  it('shows delivered after the recipient fetches and read after they read', async () => {
    const { a, b, id } = await pair();
    const sent = await send(a, id, 'status check');
    const messageId = sent.body.message.id;
    const stateOf = async () => {
      const history = await a.client.get(`/api/conversations/${id}/messages`);
      return history.body.messages.find((m) => m.id === messageId).receipts[0].state;
    };
    expect(await stateOf()).toBe('sent');

    await b.client.get(`/api/conversations/${id}/messages`);
    expect(await stateOf()).toBe('delivered');

    await b.client.post(`/api/conversations/${id}/read`, {});
    expect(await stateOf()).toBe('read');
  });

  it('replying marks earlier incoming messages as read', async () => {
    const { a, b, id } = await pair();
    const first = await send(a, id, 'question');
    await send(b, id, 'answer');
    const history = await a.client.get(`/api/conversations/${id}/messages`);
    const question = history.body.messages.find((m) => m.id === first.body.message.id);
    expect(question.receipts[0].state).toBe('read');
    const list = await b.client.get('/api/conversations');
    expect(list.body.conversations[0].unreadCount).toBe(0);
  });

  it('aggregates receipts per recipient in groups', async () => {
    const [owner, m1, m2] = await Promise.all([signUp(ctx.app), signUp(ctx.app), signUp(ctx.app)]);
    const created = await owner.client.post('/api/conversations/group', {
      name: 'G',
      memberIds: [m1.id, m2.id],
    });
    const id = created.body.conversation.id;
    await send(owner, id, 'hi all');
    await m1.client.post(`/api/conversations/${id}/read`, {});
    const history = await owner.client.get(`/api/conversations/${id}/messages`);
    const states = Object.fromEntries(
      history.body.messages[0].receipts.map((r) => [r.userId, r.state]),
    );
    expect(states[m1.id]).toBe('read');
    expect(states[m2.id]).toBe('sent');
  });

  it('only the author can edit or delete, and edits are marked', async () => {
    const { a, b, id } = await pair();
    const sent = await send(a, id, 'original');
    const messageId = sent.body.message.id;

    expect((await b.client.patch(`/api/messages/${messageId}`, { body: 'hijack' })).status).toBe(
      403,
    );
    expect((await b.client.delete(`/api/messages/${messageId}`)).status).toBe(403);

    const edited = await a.client.patch(`/api/messages/${messageId}`, { body: ' changed ' });
    expect(edited.status).toBe(200);
    expect(edited.body.message.body).toBe('changed');
    expect(edited.body.message.editedAt).not.toBeNull();
    expect((await a.client.patch(`/api/messages/${messageId}`, { body: '  ' })).status).toBe(400);
  });

  it('soft-deletes: clears the body, keeps the slot, and blocks further edits', async () => {
    const { a, id } = await pair();
    await send(a, id, 'before');
    const target = await send(a, id, 'secret text');
    await send(a, id, 'after');

    expect((await a.client.delete(`/api/messages/${target.body.message.id}`)).status).toBe(204);
    expect((await a.client.delete(`/api/messages/${target.body.message.id}`)).status).toBe(204);

    const history = await a.client.get(`/api/conversations/${id}/messages`);
    expect(history.body.messages.map((m) => m.body)).toEqual(['before', '', 'after']);
    expect(history.body.messages[1].deletedAt).not.toBeNull();
    const edit = await a.client.patch(`/api/messages/${target.body.message.id}`, { body: 'x' });
    expect(edit.status).toBe(409);
  });

  it('answers 404 for messages in conversations the caller does not belong to', async () => {
    const { a, id } = await pair();
    const outsider = await signUp(ctx.app);
    const sent = await send(a, id, 'private');
    const messageId = sent.body.message.id;
    expect((await outsider.client.patch(`/api/messages/${messageId}`, { body: 'x' })).status).toBe(
      404,
    );
    expect((await outsider.client.delete(`/api/messages/${messageId}`)).status).toBe(404);
    expect((await outsider.client.delete('/api/messages/999999')).status).toBe(404);
  });

  it("syncs only messages from the caller's own conversations after a given id", async () => {
    const { a, b, id } = await pair();
    const other = await pair();
    const first = await send(a, id, 'one');
    await send(a, id, 'two');
    await send(other.a, other.id, 'not for b');

    const sync = await b.client.get(`/api/sync?afterId=${first.body.message.id}`);
    expect(sync.status).toBe(200);
    expect(sync.body.messages.map((m) => m.body)).toEqual(['two']);
    expect(sync.body.hasMore).toBe(false);

    const all = await b.client.get('/api/sync?afterId=0');
    expect(all.body.messages.map((m) => m.body)).toEqual(['one', 'two']);

    // Syncing counts as delivery.
    const history = await a.client.get(`/api/conversations/${id}/messages`);
    expect(history.body.messages.every((m) => m.receipts[0].state === 'delivered')).toBe(true);
  });

  it('requires authentication on message endpoints', async () => {
    const { id } = await pair();
    const { createClient } = await import('./helpers/test-app.js');
    const anon = createClient(ctx.app);
    expect((await anon.get(`/api/conversations/${id}/messages`)).status).toBe(401);
    expect((await anon.get('/api/sync')).status).toBe(401);
    expect((await anon.delete('/api/messages/1')).status).toBe(401);
  });
});
