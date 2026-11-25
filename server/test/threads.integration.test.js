import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers/test-app.js';

describe('group threads', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  let seq = 0;
  const send = (user, id, body, extra = {}) =>
    user.client.post(`/api/conversations/${id}/messages`, {
      clientId: `thr-${Date.now()}-${(seq += 1)}`,
      body,
      ...extra,
    });

  async function group() {
    const [a, b, c] = await Promise.all([
      signUp(ctx.app, 'a'),
      signUp(ctx.app, 'b'),
      signUp(ctx.app, 'c'),
    ]);
    const res = await a.client.post('/api/conversations/group', {
      name: 'Team',
      memberIds: [b.id, c.id],
    });
    return { a, b, c, id: res.body.conversation.id };
  }

  it('keeps replies out of the main history and counts them on the root', async () => {
    const { a, b, id } = await group();
    const root = (await send(a, id, 'topic')).body.message;
    const reply = await send(b, id, 'in the thread', { threadRootId: root.id });
    expect(reply.status).toBe(201);
    expect(reply.body.message.threadRootId).toBe(root.id);
    await send(a, id, 'later top-level');

    const history = await b.client.get(`/api/conversations/${id}/messages`);
    expect(history.body.messages.map((m) => m.body)).toEqual(['topic', 'later top-level']);
    expect(history.body.messages[0]).toMatchObject({ threadCount: 1 });

    const thread = await a.client.get(`/api/messages/${root.id}/thread`);
    expect(thread.body.root.id).toBe(root.id);
    expect(thread.body.messages.map((m) => m.body)).toEqual(['in the thread']);
  });

  it('publishes the root again when a reply arrives, so counts stay live', async () => {
    const { a, b, id } = await group();
    const root = (await send(a, id, 'live root')).body.message;
    const updates = [];
    const off = ctx.container.events.subscribe('message.updated', (e) => updates.push(e.message));
    await send(b, id, 'r1', { threadRootId: root.id });
    off();
    expect(updates.find((m) => m.id === root.id)?.threadCount).toBe(1);
  });

  it('rejects threads in direct chats, nested threads and foreign roots', async () => {
    const { a, b, id } = await group();
    const root = (await send(a, id, 'root')).body.message;
    const reply = (await send(b, id, 'reply', { threadRootId: root.id })).body.message;
    expect((await send(a, id, 'nested', { threadRootId: reply.id })).status).toBe(400);

    const other = await group();
    expect((await send(a, id, 'cross', { threadRootId: 999999 })).status).toBe(400);
    const foreign = (await send(other.a, other.id, 'elsewhere')).body.message;
    expect((await send(a, id, 'cross', { threadRootId: foreign.id })).status).toBe(400);

    const dm = (await a.client.post('/api/conversations/direct', { userId: b.id })).body
      .conversation.id;
    const dmRoot = (await send(a, dm, 'hi')).body.message;
    expect((await send(a, dm, 'thread', { threadRootId: dmRoot.id })).status).toBe(400);
  });

  it('hides threads from non-members', async () => {
    const { a, id } = await group();
    const root = (await send(a, id, 'private root')).body.message;
    const outsider = await signUp(ctx.app, 'x');
    expect((await outsider.client.get(`/api/messages/${root.id}/thread`)).status).toBe(404);
  });
});
