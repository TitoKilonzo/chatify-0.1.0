import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectSocket,
  cookieValue,
  createClient,
  createTestApp,
  signUp,
  startRealtime,
  waitFor,
} from './helpers/test-app.js';

describe('device management', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  /** The user's first device plus a second one signed in with the same credentials. */
  async function twoDevices() {
    const first = await signUp(ctx.app, 'dev');
    const second = createClient(ctx.app);
    const login = await second.post('/api/auth/login', {
      identifier: first.credentials.email,
      password: first.credentials.password,
    });
    expect(login.status).toBe(200);
    const cookie = ['chatify_at', 'chatify_rt']
      .map((name) => `${name}=${encodeURIComponent(cookieValue(login, name))}`)
      .join('; ');
    return { first, second, secondCookie: cookie };
  }

  it('lists every signed-in device and marks the caller', async () => {
    const { first, second } = await twoDevices();
    const mine = (await first.client.get('/api/auth/sessions')).body.sessions;
    const theirs = (await second.get('/api/auth/sessions')).body.sessions;
    expect(mine).toHaveLength(2);
    expect(mine.filter((s) => s.current)).toHaveLength(1);
    expect(theirs.filter((s) => s.current)).toHaveLength(1);
    expect(mine.find((s) => s.current).id).not.toBe(theirs.find((s) => s.current).id);
    expect(mine[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), startedAt: expect.any(String) }),
    );
  });

  it('keeps the same session id when the token rotates', async () => {
    const { first } = await twoDevices();
    const before = (await first.client.get('/api/auth/sessions')).body.sessions.find(
      (s) => s.current,
    );
    expect((await first.client.post('/api/auth/refresh', {})).status).toBe(200);
    const after = (await first.client.get('/api/auth/sessions')).body.sessions;
    expect(after).toHaveLength(2);
    expect(after.find((s) => s.current).id).toBe(before.id);
  });

  it('requires sign-in', async () => {
    expect((await createClient(ctx.app).get('/api/auth/sessions')).status).toBe(401);
  });

  it('ends another device without signing out the caller', async () => {
    const { first, second } = await twoDevices();
    const other = (await first.client.get('/api/auth/sessions')).body.sessions.find(
      (s) => !s.current,
    );
    expect((await first.client.delete(`/api/auth/sessions/${other.id}`)).status).toBe(204);

    // The ended device cannot refresh, and that must not look like theft to the others.
    expect((await second.post('/api/auth/refresh', {})).status).toBe(401);
    expect((await first.client.post('/api/auth/refresh', {})).status).toBe(200);
    expect((await first.client.get('/api/auth/me')).status).toBe(200);
    expect((await first.client.get('/api/auth/sessions')).body.sessions).toHaveLength(1);
  });

  it("cannot end a session that does not exist or is someone else's", async () => {
    const { first } = await twoDevices();
    const stranger = await signUp(ctx.app, 'str');
    const theirs = (await stranger.client.get('/api/auth/sessions')).body.sessions[0];
    expect((await first.client.delete(`/api/auth/sessions/${theirs.id}`)).status).toBe(404);
    expect((await first.client.delete('/api/auth/sessions/nope')).status).toBe(404);
    expect((await stranger.client.get('/api/auth/sessions')).body.sessions).toHaveLength(1);
  });

  it('ending the current session signs this device out', async () => {
    const { first } = await twoDevices();
    const me = (await first.client.get('/api/auth/sessions')).body.sessions.find((s) => s.current);
    expect((await first.client.delete(`/api/auth/sessions/${me.id}`)).status).toBe(204);
    expect((await first.client.post('/api/auth/refresh', {})).status).toBe(401);
  });

  it('signs out every other device at once', async () => {
    const { first, second } = await twoDevices();
    const third = createClient(ctx.app);
    await third.post('/api/auth/login', {
      identifier: first.credentials.email,
      password: first.credentials.password,
    });
    const res = await first.client.post('/api/auth/sessions/revoke-others', {});
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBe(2);
    expect((await second.post('/api/auth/refresh', {})).status).toBe(401);
    expect((await third.post('/api/auth/refresh', {})).status).toBe(401);
    expect((await first.client.post('/api/auth/refresh', {})).status).toBe(200);
    expect((await first.client.get('/api/auth/sessions')).body.sessions).toHaveLength(1);
  });

  it('drops the ended device live and refuses its reconnection', async () => {
    const { first, secondCookie } = await twoDevices();
    const live = await startRealtime(ctx);
    try {
      const mySocket = await connectSocket(live.url, first.cookie);
      const otherSocket = await connectSocket(live.url, secondCookie);
      const dropped = waitFor(otherSocket, 'disconnect');
      const other = (await first.client.get('/api/auth/sessions')).body.sessions.find(
        (s) => !s.current,
      );
      await first.client.delete(`/api/auth/sessions/${other.id}`);
      await dropped;
      expect(mySocket.connected).toBe(true);
      await expect(connectSocket(live.url, secondCookie)).rejects.toThrow('SESSION_REVOKED');
      mySocket.close();
    } finally {
      await live.close();
    }
  });
});
