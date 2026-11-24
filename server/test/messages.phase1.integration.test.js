import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers/test-app.js';

describe('messages phase 1: replies, reactions, pins, forward, search', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  let seq = 0;
  const clientId = () => `p1-client-${Date.now()}-${(seq += 1)}`;

  async function pair() {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  const send = (user, id, body, extra = {}) =>
    user.client.post(`/api/conversations/${id}/messages`, { clientId: clientId(), body, ...extra });

  describe('replies', () => {
    it('stores a reply with a preview of the original', async () => {
      const { a, b, id } = await pair();
      const original = (await send(a, id, 'what time is it')).body.message;
      const res = await send(b, id, 'noon', { replyToId: original.id });
      expect(res.status).toBe(201);
      expect(res.body.message.replyTo).toMatchObject({
        id: original.id,
        senderId: a.id,
        body: 'what time is it',
        deleted: false,
      });
    });

    it('rejects a reply to a message from another conversation', async () => {
      const { a, id } = await pair();
      const other = await pair();
      const foreign = (await send(other.a, other.id, 'elsewhere')).body.message;
      const res = await send(a, id, 'nope', { replyToId: foreign.id });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('reactions', () => {
    it('sets, changes and clears one reaction per user', async () => {
      const { a, b, id } = await pair();
      const message = (await send(a, id, 'react to me')).body.message;
      const first = await b.client.put(`/api/messages/${message.id}/reaction`, { key: 'like' });
      expect(first.status).toBe(200);
      expect(first.body.message.reactions).toEqual([{ key: 'like', userIds: [b.id] }]);

      const changed = await b.client.put(`/api/messages/${message.id}/reaction`, { key: 'love' });
      expect(changed.body.message.reactions).toEqual([{ key: 'love', userIds: [b.id] }]);

      const cleared = await b.client.delete(`/api/messages/${message.id}/reaction`);
      expect(cleared.body.message.reactions).toEqual([]);
    });

    it('rejects unknown keys and non-members', async () => {
      const { a, id } = await pair();
      const message = (await send(a, id, 'x1')).body.message;
      const bad = await a.client.put(`/api/messages/${message.id}/reaction`, { key: 'nope' });
      expect(bad.status).toBe(400);
      const outsider = await signUp(ctx.app, 'c');
      const denied = await outsider.client.put(`/api/messages/${message.id}/reaction`, {
        key: 'like',
      });
      expect([403, 404]).toContain(denied.status);
    });
  });

  describe('pins', () => {
    it('pins, lists and unpins', async () => {
      const { a, b, id } = await pair();
      const message = (await send(a, id, 'important')).body.message;
      const pinned = await b.client.put(`/api/messages/${message.id}/pin`);
      expect(pinned.status).toBe(200);
      expect(pinned.body.message.pinnedBy).toBe(b.id);
      expect(pinned.body.message.pinnedAt).toBeTruthy();

      const list = await a.client.get(`/api/conversations/${id}/pins`);
      expect(list.body.messages.map((m) => m.id)).toEqual([message.id]);

      const unpinned = await a.client.delete(`/api/messages/${message.id}/pin`);
      expect(unpinned.body.message.pinnedAt).toBeNull();
      expect((await a.client.get(`/api/conversations/${id}/pins`)).body.messages).toEqual([]);
    });

    it('limits pins per conversation', async () => {
      const { a, id } = await pair();
      for (let i = 0; i < 10; i += 1) {
        const m = (await send(a, id, `pin ${i}`)).body.message;
        expect((await a.client.put(`/api/messages/${m.id}/pin`)).status).toBe(200);
      }
      const extra = (await send(a, id, 'one too many')).body.message;
      const res = await a.client.put(`/api/messages/${extra.id}/pin`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PIN_LIMIT');
    });
  });

  describe('forward', () => {
    it('copies a message into other conversations and marks it forwarded', async () => {
      const { a, id } = await pair();
      const other = await pair();
      const target = (await a.client.post('/api/conversations/direct', { userId: other.a.id })).body
        .conversation.id;
      const message = (await send(a, id, 'pass it on')).body.message;
      const res = await a.client.post(`/api/messages/${message.id}/forward`, {
        conversationIds: [target],
      });
      expect(res.status).toBe(201);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0]).toMatchObject({
        conversationId: target,
        body: 'pass it on',
        forwarded: true,
        senderId: a.id,
      });
    });

    it('duplicates the attachment so the copy is independent', async () => {
      const { a, id } = await pair();
      const other = await pair();
      const target = (await a.client.post('/api/conversations/direct', { userId: other.a.id })).body
        .conversation.id;
      const image = await sharp({
        create: { width: 30, height: 30, channels: 3, background: '#4A2F22' },
      })
        .png()
        .toBuffer();
      const up = await a.client.upload('/api/attachments', image, 'pic.png');
      const message = (await send(a, id, '', { attachmentId: up.body.attachment.id })).body.message;
      const res = await a.client.post(`/api/messages/${message.id}/forward`, {
        conversationIds: [target],
      });
      expect(res.status).toBe(201);
      const copy = res.body.messages[0].attachment;
      expect(copy).toBeTruthy();
      expect(copy.id).not.toBe(up.body.attachment.id);
      const file = await a.client.get(`/api/attachments/${copy.id}`).buffer(true);
      expect(file.status).toBe(200);
    });

    it("refuses when any target is not the caller's conversation, sending nothing", async () => {
      const { a, id } = await pair();
      const foreign = await pair();
      const mine = (await a.client.post('/api/conversations/direct', { userId: foreign.a.id })).body
        .conversation.id;
      const message = (await send(a, id, 'atomic check')).body.message;
      const res = await a.client.post(`/api/messages/${message.id}/forward`, {
        conversationIds: [mine, foreign.id],
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const sent = await a.client.get(`/api/conversations/${mine}/messages`);
      expect(sent.body.messages).toEqual([]);
    });

    it('rejects more than five targets', async () => {
      const { a, id } = await pair();
      const message = (await send(a, id, 'many')).body.message;
      const ids = Array.from({ length: 6 }, () => crypto.randomUUID());
      const res = await a.client.post(`/api/messages/${message.id}/forward`, {
        conversationIds: ids,
      });
      expect(res.status).toBe(400);
    });
  });

  describe('search', () => {
    it("finds matches only in the caller's conversations", async () => {
      const { a, b, id } = await pair();
      const needle = `zebra${Date.now()}`;
      await send(a, id, `the ${needle} crossing`);
      const hidden = await pair();
      await send(hidden.a, hidden.id, `secret ${needle}`);

      const res = await b.client.get(`/api/search/messages?q=${needle}`);
      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].conversationId).toBe(id);
    });

    it('treats wildcards literally and enforces a minimum length', async () => {
      const { a, id } = await pair();
      await send(a, id, 'plain text only');
      const wild = await a.client.get('/api/search/messages?q=%25%25');
      expect(wild.status).toBe(200);
      expect(wild.body.messages).toEqual([]);
      const short = await a.client.get('/api/search/messages?q=a');
      expect(short.status).toBe(400);
    });

    it('hides deleted messages', async () => {
      const { a, id } = await pair();
      const needle = `gone${Date.now()}`;
      const m = (await send(a, id, needle)).body.message;
      await a.client.delete(`/api/messages/${m.id}`);
      const res = await a.client.get(`/api/search/messages?q=${needle}`);
      expect(res.body.messages).toEqual([]);
    });
  });
});
