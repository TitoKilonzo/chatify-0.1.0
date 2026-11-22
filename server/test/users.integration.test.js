import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  cookieValue,
  createClient,
  createTestApp,
  rawPost,
  validUser,
} from './helpers/test-app.js';

let counter = 1000;

describe('profile', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  async function signedIn() {
    const client = createClient(ctx.app);
    const user = validUser((counter += 1));
    const res = await client.post('/api/auth/register', user);
    return { client, user, registered: res };
  }

  it('requires authentication', async () => {
    const client = createClient(ctx.app);
    const res = await client.patch('/api/users/me', { displayName: 'New Name' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('requires a csrf token', async () => {
    const { client } = await signedIn();
    const res = await client.agent.patch('/api/users/me').send({ displayName: 'New Name' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('updates and trims the display name', async () => {
    const { client } = await signedIn();
    const res = await client.patch('/api/users/me', { displayName: '  Renamed User  ' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Renamed User');
    const me = await client.get('/api/auth/me');
    expect(me.body.user.displayName).toBe('Renamed User');
  });

  it('rejects an empty or oversized display name', async () => {
    const { client } = await signedIn();
    const empty = await client.patch('/api/users/me', { displayName: '   ' });
    expect(empty.status).toBe(400);
    const long = await client.patch('/api/users/me', { displayName: 'x'.repeat(51) });
    expect(long.status).toBe(400);
  });

  it('ignores attempts to change protected fields', async () => {
    const { client, user } = await signedIn();
    const res = await client.patch('/api/users/me', {
      displayName: 'Still Me',
      username: 'hijacked',
      email: 'hijacked@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(user.username);
    expect(res.body.user.email).toBe(user.email);
  });
});

describe('password change', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  async function signedIn() {
    const client = createClient(ctx.app);
    const user = validUser((counter += 1));
    const registered = await client.post('/api/auth/register', user);
    return { client, user, registered };
  }

  const NEW_PASSWORD = 'a brand new passphrase';

  it('requires authentication', async () => {
    const res = await createClient(ctx.app).post('/api/users/me/password', {
      currentPassword: 'whatever password',
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong current password with a field-level error', async () => {
    const { client } = await signedIn();
    const res = await client.post('/api/users/me/password', {
      currentPassword: 'not my password',
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(res.body.error.details[0].path).toBe('currentPassword');
  });

  it('rejects a weak or unchanged new password', async () => {
    const { client, user } = await signedIn();
    const weak = await client.post('/api/users/me/password', {
      currentPassword: user.password,
      newPassword: 'short',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.map((detail) => detail.path)).toContain('newPassword');

    const same = await client.post('/api/users/me/password', {
      currentPassword: user.password,
      newPassword: user.password,
    });
    expect(same.status).toBe(400);
  });

  it('changes the password, revokes other sessions, and keeps this device signed in', async () => {
    const { client, user, registered } = await signedIn();
    const otherDeviceToken = cookieValue(registered, 'chatify_rt');

    const res = await client.post('/api/users/me/password', {
      currentPassword: user.password,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(204);
    expect(cookieValue(res, 'chatify_rt')).toBeTruthy();
    expect(cookieValue(res, 'chatify_rt')).not.toBe(otherDeviceToken);

    expect((await client.get('/api/auth/me')).status).toBe(200);

    const csrf = await client.csrfToken();
    const oldSession = await rawPost(ctx.app, '/api/auth/refresh', {
      cookies: [`chatify_rt=${otherDeviceToken}`, `chatify_csrf=${csrf}`],
      csrf,
    });
    expect(oldSession.status).toBe(401);

    const withOld = await createClient(ctx.app).post('/api/auth/login', {
      identifier: user.username,
      password: user.password,
    });
    expect(withOld.status).toBe(401);

    const withNew = await createClient(ctx.app).post('/api/auth/login', {
      identifier: user.username,
      password: NEW_PASSWORD,
    });
    expect(withNew.status).toBe(200);
  });

  it('never exposes the password hash through any user endpoint', async () => {
    const { client } = await signedIn();
    const me = await client.get('/api/auth/me');
    const patched = await client.patch('/api/users/me', { displayName: 'Hash Check' });
    expect(JSON.stringify([me.body, patched.body])).not.toMatch(/argon2|password/i);
    // Only PATCH /me exists; there is no way to read a user record other than through /auth/me.
    expect((await client.get('/api/users/me')).status).toBe(404);
    expect((await request(ctx.app).get('/api/users/me')).status).toBe(401);
  });
});
