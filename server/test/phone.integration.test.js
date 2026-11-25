import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { normalizePhone } from '../src/modules/phone/phone-number.js';
import { createAfricasTalkingSms } from '../src/modules/phone/sms.js';
import { createClient, createTestApp, signUp } from './helpers/test-app.js';

describe('phone numbers', () => {
  it('normalises to E.164', () => {
    expect(normalizePhone('0712 345 678')).toBe('+254712345678');
    expect(normalizePhone('+254 712-345-678')).toBe('+254712345678');
    expect(normalizePhone('00254712345678')).toBe('+254712345678');
    expect(normalizePhone('254712345678')).toBe('+254712345678');
    expect(normalizePhone('0712345678', '255')).toBe('+255712345678');
  });

  it('rejects things that are not numbers', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('+0123456789')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe("Africa's Talking provider", () => {
  const make = (response) => {
    const fetchImpl = vi.fn(async () => response);
    return {
      fetchImpl,
      sms: createAfricasTalkingSms({ username: 'u', apiKey: 'k', senderId: 'CHATIFY', fetchImpl }),
    };
  };
  const ok = (status) =>
    new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ status }] } }), { status: 201 });

  it('posts the message with the API key header', async () => {
    const { sms, fetchImpl } = make(ok('Success'));
    await sms.send('+254712345678', 'hello');
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers.apiKey).toBe('k');
    expect(init.body.get('to')).toBe('+254712345678');
    expect(init.body.get('from')).toBe('CHATIFY');
  });

  it('fails when the carrier did not accept the message', async () => {
    await expect(make(ok('InvalidPhoneNumber')).sms.send('+1', 'x')).rejects.toThrow(/not sent/);
    await expect(make(new Response('', { status: 500 })).sms.send('+1', 'x')).rejects.toThrow(
      /500/,
    );
  });
});

describe('phone sign-in', () => {
  const sent = [];
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp(
      {},
      {
        smsOverride: {
          name: 'test',
          send: async (phone, message) => sent.push({ phone, code: /(\d{6})/.exec(message)[1] }),
        },
      },
    );
  });
  afterAll(() => ctx.cleanup());

  let n = 0;
  const number = () =>
    `+2547${String(10000000 + (n += 1) + Math.floor(Math.random() * 1000) * 100).slice(0, 8)}`;
  const lastCode = (phone) => sent.filter((s) => s.phone === phone).at(-1)?.code;

  const request = (client, phone) => client.post('/api/phone/login/request', { phone });
  const verify = (client, body) => client.post('/api/phone/login/verify', body);

  it('reports that phone sign-in is enabled', async () => {
    const res = await createClient(ctx.app).get('/api/phone/config');
    expect(res.body).toEqual({ enabled: true });
  });

  it('creates an account for a new number after asking for a name, then signs in again', async () => {
    const client = createClient(ctx.app);
    const phone = number();
    expect((await request(client, phone)).status).toBe(202);
    const code = lastCode(phone);

    const first = await verify(client, { phone, code });
    expect(first.body).toEqual({ needsProfile: true });

    const created = await verify(client, { phone, code, displayName: 'Wanjiru' });
    expect(created.status).toBe(200);
    expect(created.body.user).toMatchObject({ displayName: 'Wanjiru', phone, email: null });
    expect((await client.get('/api/auth/me')).status).toBe(200);

    // The code is single use.
    expect((await verify(createClient(ctx.app), { phone, code })).status).toBe(400);

    // Signing in again later finds the same account and needs no name.
    const other = createClient(ctx.app);
    await ctx.database.db.delete((await import('../src/db/schema.js')).phoneCodes);
    await request(other, phone);
    const again = await verify(other, { phone, code: lastCode(phone) });
    expect(again.body.user.id).toBe(created.body.user.id);
  });

  it('rejects wrong codes and locks the code after five guesses', async () => {
    const client = createClient(ctx.app);
    const phone = number();
    await request(client, phone);
    const real = lastCode(phone);
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      expect((await verify(client, { phone, code: wrong, displayName: 'X' })).status).toBe(400);
    }
    expect((await verify(client, { phone, code: real, displayName: 'X' })).status).toBe(400);
  });

  it('limits how often codes can be requested', async () => {
    const client = createClient(ctx.app);
    const phone = number();
    expect((await request(client, phone)).status).toBe(202);
    const again = await request(client, phone);
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('CODE_TOO_SOON');
  });

  it('rejects malformed numbers and codes', async () => {
    const client = createClient(ctx.app);
    expect((await request(client, 'nope')).status).toBe(400);
    expect((await verify(client, { phone: number(), code: '12' })).status).toBe(400);
  });

  it('links a number to a signed-in account and lets it go again', async () => {
    const user = await signUp(ctx.app, 'a');
    const phone = number();
    expect((await user.client.post('/api/phone/link/request', { phone })).status).toBe(202);
    const bad = await user.client.post('/api/phone/link/verify', { phone, code: '000000' });
    expect(bad.status).toBe(400);
    const done = await user.client.post('/api/phone/link/verify', {
      phone,
      code: lastCode(phone),
    });
    expect(done.body.user.phone).toBe(phone);

    const other = await signUp(ctx.app, 'b');
    const taken = await other.client.post('/api/phone/link/request', { phone });
    expect(taken.status).toBe(409);

    expect((await user.client.delete('/api/phone')).status).toBe(204);
    expect((await user.client.get('/api/auth/me')).body.user.phone).toBeNull();
  });

  it('requires a session to link', async () => {
    const res = await createClient(ctx.app).post('/api/phone/link/request', { phone: number() });
    expect(res.status).toBe(401);
  });
});

describe('phone sign-in when no provider is configured', () => {
  it('is off and refuses requests', async () => {
    const ctx = await createTestApp();
    const client = createClient(ctx.app);
    expect((await client.get('/api/phone/config')).body).toEqual({ enabled: false });
    expect((await client.post('/api/phone/login/request', { phone: '0712345678' })).status).toBe(
      503,
    );
    await ctx.cleanup();
  });
});
