import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { messages } from '../src/db/schema.js';
import { createTestApp, signUp } from './helpers/test-app.js';

describe('disappearing messages', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  let seq = 0;
  const send = (user, id, body) =>
    user.client.post(`/api/conversations/${id}/messages`, {
      clientId: `dis-${Date.now()}-${(seq += 1)}`,
      body,
    });

  async function pair() {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  const setTimer = (user, id, seconds) =>
    user.client.put(`/api/conversations/${id}/disappearing`, { seconds });

  it('sets the timer and exposes it on the conversation', async () => {
    const { a, b, id } = await pair();
    const res = await setTimer(b, id, 86400);
    expect(res.status).toBe(200);
    expect(res.body.conversation.disappearAfterSeconds).toBe(86400);
    const seen = await a.client.get(`/api/conversations/${id}`);
    expect(seen.body.conversation.disappearAfterSeconds).toBe(86400);
    const off = await setTimer(a, id, 0);
    expect(off.body.conversation.disappearAfterSeconds).toBeNull();
  });

  it('rejects unsupported durations', async () => {
    const { a, id } = await pair();
    expect((await setTimer(a, id, 5)).status).toBe(400);
  });

  it('only owners and admins change the timer in a group', async () => {
    const [owner, member] = await Promise.all([signUp(ctx.app, 'o'), signUp(ctx.app, 'm')]);
    const group = await owner.client.post('/api/conversations/group', {
      name: 'Team',
      memberIds: [member.id],
    });
    const id = group.body.conversation.id;
    expect((await setTimer(member, id, 3600)).status).toBe(403);
    expect((await setTimer(owner, id, 3600)).status).toBe(200);
  });

  it('stamps new messages with an expiry and leaves older ones alone', async () => {
    const { a, id } = await pair();
    const before = (await send(a, id, 'before')).body.message;
    await setTimer(a, id, 3600);
    const after = (await send(a, id, 'after')).body.message;
    expect(before.expiresAt).toBeNull();
    expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(Date.now() + 3_500_000);
  });

  it('hides and purges expired messages, with their files, and announces it', async () => {
    const { a, b, id } = await pair();
    await setTimer(a, id, 3600);
    const gone = (await send(a, id, 'fleeting')).body.message;
    const kept = (await send(a, id, 'staying')).body.message;
    const events = [];
    const unsubscribe = ctx.container.events.subscribe('message.expired', (e) => events.push(e));

    await ctx.database.db
      .update(messages)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(messages.id, gone.id));

    // Hidden immediately, before the purge job has run.
    const listed = await b.client.get(`/api/conversations/${id}/messages`);
    expect(listed.body.messages.map((m) => m.id)).toEqual([kept.id]);
    const found = await b.client.get('/api/search/messages?q=fleeting');
    expect(found.body.messages).toEqual([]);

    expect(await ctx.container.messagesService.expireDue()).toBe(1);
    unsubscribe();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ conversationId: id, messageIds: [gone.id] });
    expect(events[0].memberIds).toEqual(expect.arrayContaining([a.id, b.id]));
    const rows = await ctx.database.db.select().from(messages).where(eq(messages.id, gone.id));
    expect(rows).toEqual([]);
    expect(await ctx.container.messagesService.expireDue()).toBe(0);
  });
});
