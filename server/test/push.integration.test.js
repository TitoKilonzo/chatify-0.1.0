import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { createClient, createTestApp, signUp } from './helpers/test-app.js';

const VAPID = {
  VAPID_PUBLIC_KEY: 'BPublicKeyForTests',
  VAPID_PRIVATE_KEY: 'PrivateKeyForTests',
  VAPID_SUBJECT: 'mailto:ops@example.com',
};

const subscription = (n) => ({
  endpoint: `https://push.example.com/send/${n}`,
  keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
});

describe('web push', () => {
  const sent = [];
  let failWith = null;
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp(VAPID, {
      pushSender: async (sub, payload) => {
        if (failWith) {
          throw Object.assign(new Error('gone'), { statusCode: failWith });
        }
        sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      },
    });
  });
  afterAll(() => ctx.cleanup());

  async function pair() {
    const [a, b] = await Promise.all([signUp(ctx.app, 'a'), signUp(ctx.app, 'b')]);
    const res = await a.client.post('/api/conversations/direct', { userId: b.id });
    return { a, b, id: res.body.conversation.id };
  }

  const send = (user, id, body) =>
    user.client.post(`/api/conversations/${id}/messages`, {
      clientId: `push-${Math.random().toString(36).slice(2)}`,
      body,
    });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('exposes the public key and reports whether push is enabled', async () => {
    const { a } = await pair();
    const res = await a.client.get('/api/push/key');
    expect(res.body).toEqual({ enabled: true, publicKey: VAPID.VAPID_PUBLIC_KEY });
  });

  it('requires a signed-in user and a valid subscription', async () => {
    const { a } = await pair();
    const anon = await createClient(ctx.app).get('/api/push/key');
    expect(anon.status).toBe(401);
    const bad = await a.client.post('/api/push/subscriptions', { endpoint: 'nope', keys: {} });
    expect(bad.status).toBe(400);
  });

  it('notifies an offline member and links to the conversation', async () => {
    const { a, b, id } = await pair();
    const sub = subscription(`offline-${id}`);
    expect((await b.client.post('/api/push/subscriptions', sub)).status).toBe(204);
    await send(a, id, 'are you there');
    await settle();
    const hit = sent.find((entry) => entry.endpoint === sub.endpoint);
    expect(hit.payload).toMatchObject({
      body: 'are you there',
      url: `/chats/${id}`,
      conversationId: id,
    });
  });

  it('does not notify the sender or a muted member', async () => {
    const { a, b, id } = await pair();
    const own = subscription(`own-${id}`);
    const muted = subscription(`muted-${id}`);
    await a.client.post('/api/push/subscriptions', own);
    await b.client.post('/api/push/subscriptions', muted);
    await b.client.put(`/api/conversations/${id}/preferences`, { muted: true });
    await send(a, id, 'quiet please');
    await settle();
    expect(sent.some((entry) => entry.endpoint === own.endpoint)).toBe(false);
    expect(sent.some((entry) => entry.endpoint === muted.endpoint)).toBe(false);
  });

  it('removes a subscription the push service reports as gone', async () => {
    const { a, b, id } = await pair();
    const sub = subscription(`gone-${id}`);
    await b.client.post('/api/push/subscriptions', sub);
    failWith = 410;
    await send(a, id, 'first');
    await settle();
    failWith = null;
    await send(a, id, 'second');
    await settle();
    expect(sent.some((entry) => entry.endpoint === sub.endpoint)).toBe(false);
  });

  it('stops notifying after unsubscribe', async () => {
    const { a, b, id } = await pair();
    const sub = subscription(`off-${id}`);
    await b.client.post('/api/push/subscriptions', sub);
    expect(
      (await b.client.delete('/api/push/subscriptions', { endpoint: sub.endpoint })).status,
    ).toBe(204);
    await send(a, id, 'anyone');
    await settle();
    expect(sent.some((entry) => entry.endpoint === sub.endpoint)).toBe(false);
  });
});

describe('web push configuration', () => {
  it('is disabled without keys and requires all three settings together', async () => {
    const off = await createTestApp();
    const user = await signUp(off.app, 'a');
    expect((await user.client.get('/api/push/key')).body).toEqual({
      enabled: false,
      publicKey: null,
    });
    expect((await user.client.post('/api/push/subscriptions', subscription('x'))).status).toBe(503);
    await off.cleanup();

    expect(() =>
      parseEnv({
        NODE_ENV: 'test',
        JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
        CORS_ORIGINS: 'https://chat.example.com',
        VAPID_PUBLIC_KEY: 'only-one',
      }),
    ).toThrow(/VAPID/);
  });
});
