import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, createTestApp, signUp } from './helpers/test-app.js';

// A real-looking public key: 65 bytes as 87 base64url characters.
const keyA = `B${'a'.repeat(86)}`;
const keyB = `B${'b'.repeat(86)}`;
const envelope = (text) => `e2ee:v1:${Buffer.from(text).toString('base64url')}.AAAA`;

describe('end-to-end encryption', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  let seq = 0;
  const send = (user, id, body, extra = {}) =>
    user.client.post(`/api/conversations/${id}/messages`, {
      clientId: `enc-${Date.now()}-${(seq += 1)}`,
      body,
      ...extra,
    });

  async function pair() {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  const enable = (user, id, enabled = true) =>
    user.client.put(`/api/conversations/${id}/encryption`, { enabled });

  describe('key directory', () => {
    it('publishes a key, reads it back, and shows it to other users', async () => {
      const { a, b } = await pair();
      expect((await a.client.get('/api/keys/me')).body).toEqual({
        publicKey: null,
        hasBackup: false,
      });
      expect((await a.client.put('/api/keys/me', { publicKey: keyA })).status).toBe(204);
      expect((await a.client.get('/api/keys/me')).body.publicKey).toBe(keyA);
      expect((await b.client.get(`/api/keys/${a.id}`)).body.publicKey).toBe(keyA);
      expect((await a.client.get(`/api/keys/${b.id}`)).status).toBe(404);
    });

    it('rejects malformed keys and requires sign-in', async () => {
      const { a } = await pair();
      expect((await a.client.put('/api/keys/me', { publicKey: 'short' })).status).toBe(400);
      expect((await createClient(ctx.app).get('/api/keys/me')).status).toBe(401);
    });

    it('stores a passphrase-locked backup, and replacing the key drops the old backup', async () => {
      const { a } = await pair();
      const blob = 'x'.repeat(200);
      expect((await a.client.put('/api/keys/me/backup', { backup: blob })).status).toBe(409);
      await a.client.put('/api/keys/me', { publicKey: keyA });
      expect((await a.client.put('/api/keys/me/backup', { backup: blob })).status).toBe(204);
      const got = await a.client.get('/api/keys/me/backup');
      expect(got.body).toEqual({ backup: blob, publicKey: keyA });
      expect((await a.client.get('/api/keys/me')).body.hasBackup).toBe(true);

      await a.client.put('/api/keys/me', { publicKey: keyB });
      expect((await a.client.get('/api/keys/me/backup')).status).toBe(404);
      await a.client.put('/api/keys/me/backup', { backup: blob });
      expect((await a.client.delete('/api/keys/me/backup')).status).toBe(204);
      expect((await a.client.get('/api/keys/me')).body.hasBackup).toBe(false);
    });
  });

  describe('encrypted conversations', () => {
    it('needs a key on both sides before it can be turned on', async () => {
      const { a, b, id } = await pair();
      const noSelf = await enable(a, id);
      expect(noSelf.status).toBe(409);
      expect(noSelf.body.error.code).toBe('SELF_NO_KEY');
      await a.client.put('/api/keys/me', { publicKey: keyA });
      const noPeer = await enable(a, id);
      expect(noPeer.body.error.code).toBe('PEER_NO_KEY');
      await b.client.put('/api/keys/me', { publicKey: keyB });
      const ok = await enable(a, id);
      expect(ok.status).toBe(200);
      expect(ok.body.conversation.encrypted).toBe(true);
      expect((await b.client.get(`/api/conversations/${id}`)).body.conversation.encrypted).toBe(
        true,
      );
    });

    it('is not available in groups', async () => {
      const [o, m] = await Promise.all([signUp(ctx.app, 'o'), signUp(ctx.app, 'm')]);
      const g = await o.client.post('/api/conversations/group', { name: 'G', memberIds: [m.id] });
      expect((await enable(o, g.body.conversation.id)).status).toBe(400);
    });

    async function encryptedPair() {
      const p = await pair();
      await p.a.client.put('/api/keys/me', { publicKey: keyA });
      await p.b.client.put('/api/keys/me', { publicKey: keyB });
      await enable(p.a, p.id);
      return p;
    }

    it('accepts only ciphertext, marks it, and never previews or searches it', async () => {
      const { a, b, id } = await encryptedPair();
      const plain = await send(a, id, 'hello in the clear');
      expect(plain.status).toBe(400);

      const ok = await send(a, id, envelope('secret needle'));
      expect(ok.status).toBe(201);
      expect(ok.body.message.encrypted).toBe(true);

      const list = await b.client.get('/api/conversations');
      const entry = list.body.conversations.find((c) => c.id === id);
      expect(entry.lastMessage).toMatchObject({ encrypted: true, body: '' });
      expect(entry.encrypted).toBe(true);

      const found = await b.client.get('/api/search/messages?q=e2ee');
      expect(found.body.messages).toEqual([]);
    });

    it('rejects files, plaintext edits and forwarding of encrypted messages', async () => {
      const { a, id } = await encryptedPair();
      const msg = (await send(a, id, envelope('one'))).body.message;
      expect((await a.client.patch(`/api/messages/${msg.id}`, { body: 'plain' })).status).toBe(400);
      const edited = await a.client.patch(`/api/messages/${msg.id}`, { body: envelope('two') });
      expect(edited.status).toBe(200);
      const other = await signUp(ctx.app, 'c');
      const target = (await a.client.post('/api/conversations/direct', { userId: other.id })).body
        .conversation.id;
      const fwd = await a.client.post(`/api/messages/${msg.id}/forward`, {
        conversationIds: [target],
      });
      expect(fwd.status).toBe(409);
    });

    it('keeps old plain messages plain after encryption is turned off and on', async () => {
      const { a, b, id } = await pair();
      const before = (await send(a, id, 'plain before')).body.message;
      await a.client.put('/api/keys/me', { publicKey: keyA });
      await b.client.put('/api/keys/me', { publicKey: keyB });
      await enable(a, id);
      await send(a, id, envelope('secret'));
      await enable(a, id, false);
      const after = await send(a, id, 'plain again');
      expect(after.status).toBe(201);
      expect(after.body.message.encrypted).toBe(false);
      const history = (await b.client.get(`/api/conversations/${id}/messages`)).body.messages;
      expect(history.map((m) => m.encrypted)).toEqual([false, true, false]);
      expect(history[0].id).toBe(before.id);
    });
  });
});
