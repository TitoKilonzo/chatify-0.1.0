import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { hashToken } from '../src/modules/auth/tokens.js';
import {
  cookieValue,
  createClient,
  createTestApp,
  rawPost,
  setCookieLine,
  validUser,
} from './helpers/test-app.js';
import { TEST_ORIGIN, TEST_SECRET } from './helpers/test-env.js';

let counter = 0;
const nextUser = () => validUser((counter += 1));

async function dbRow(ctx, sql, args = []) {
  const result = await ctx.database.client.execute({ sql, args });
  return result.rows[0] ?? null;
}

async function register(ctx) {
  const client = createClient(ctx.app);
  const user = nextUser();
  const res = await client.post('/api/auth/register', user);
  return { client, user, res };
}

async function replayRefresh(ctx, client, rawToken) {
  const csrf = await client.csrfToken();
  return rawPost(ctx.app, '/api/auth/refresh', {
    cookies: [`chatify_rt=${rawToken}`, `chatify_csrf=${csrf}`],
    csrf,
  });
}

describe('csrf and origin protection', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  const credentials = { identifier: 'nobody', password: 'whatever password' };

  it('rejects a state-changing request with no token', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send(credentials);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects a header token that has no matching cookie', async () => {
    const client = createClient(ctx.app);
    const token = await client.csrfToken();
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('X-CSRF-Token', token)
      .send(credentials);
    expect(res.status).toBe(403);
  });

  it('rejects a forged token even when cookie and header agree', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Cookie', ['chatify_csrf=forged.token'])
      .set('X-CSRF-Token', 'forged.token')
      .send(credentials);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects a request from an origin outside the allow-list', async () => {
    const client = createClient(ctx.app);
    const token = await client.csrfToken();
    const res = await client.agent
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('X-CSRF-Token', token)
      .send(credentials);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('accepts a request from an allowed origin with a valid token', async () => {
    const client = createClient(ctx.app);
    const token = await client.csrfToken();
    const res = await client.agent
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('X-CSRF-Token', token)
      .send(credentials);
    expect(res.status).toBe(401);
  });

  it('does not require a token for safe methods', async () => {
    const res = await request(ctx.app).get('/api/auth/csrf');
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(setCookieLine(res, 'chatify_csrf')).not.toMatch(/HttpOnly/i);
  });
});

describe('registration', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  it('creates an account, signs the user in, and never returns secrets', async () => {
    const { user, res } = await register(ctx);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      username: user.username,
      email: user.email,
      displayName: user.displayName,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
  });

  it('sets httpOnly SameSite=Lax session cookies with the right scope and lifetime', async () => {
    const { res } = await register(ctx);
    const access = setCookieLine(res, 'chatify_at');
    const refresh = setCookieLine(res, 'chatify_rt');

    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\//);
    expect(access).toMatch(/Max-Age=900/);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/Path=\/api\/auth/);
    expect(refresh).toMatch(/Max-Age=604800/);
  });

  it('marks cookies Secure in production', async () => {
    // The production env schema demands a Turso URL, but the test app opens its own local
    // database regardless, so the URL below is only there to satisfy validation.
    const prod = await createTestApp({
      NODE_ENV: 'production',
      DATABASE_URL: 'libsql://unused.example.turso.io',
      DATABASE_AUTH_TOKEN: 'unused',
      LOG_LEVEL: 'silent',
    });
    try {
      // Secure cookies are not stored by an http test agent, so drive the requests by hand.
      const csrfRes = await request(prod.app).get('/api/auth/csrf');
      expect(setCookieLine(csrfRes, 'chatify_csrf')).toMatch(/Secure/i);

      const csrf = csrfRes.body.csrfToken;
      const res = await rawPost(prod.app, '/api/auth/register', {
        cookies: [`chatify_csrf=${csrf}`],
        csrf,
        body: nextUser(),
      });
      expect(res.status).toBe(201);
      for (const name of ['chatify_at', 'chatify_rt']) {
        expect(setCookieLine(res, name)).toMatch(/Secure/i);
        expect(setCookieLine(res, name)).toMatch(/HttpOnly/i);
      }
    } finally {
      await prod.cleanup();
    }
  });

  it('stores an argon2id hash and only a hash of the refresh token', async () => {
    const { user, res } = await register(ctx);
    const stored = await dbRow(ctx, 'SELECT password_hash FROM users WHERE username = ?', [
      user.username,
    ]);
    expect(stored.password_hash.startsWith('$argon2id$')).toBe(true);
    expect(stored.password_hash).not.toContain(user.password);

    const rawToken = cookieValue(res, 'chatify_rt');
    const token = await dbRow(ctx, 'SELECT token_hash FROM refresh_tokens WHERE token_hash = ?', [
      hashToken(rawToken),
    ]);
    expect(token).not.toBeNull();
    expect(token.token_hash).not.toBe(rawToken);
  });

  it('normalises username and email to lower case and trims names', async () => {
    const client = createClient(ctx.app);
    const n = (counter += 1);
    const res = await client.post('/api/auth/register', {
      displayName: '  Mixed Case  ',
      username: `  Mixed_${n}  `,
      email: `  Mixed${n}@Example.COM `,
      password: 'correct horse battery',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      displayName: 'Mixed Case',
      username: `mixed_${n}`,
      email: `mixed${n}@example.com`,
    });
  });

  it('rejects duplicate usernames and emails regardless of case', async () => {
    const { user } = await register(ctx);

    const sameUsername = await createClient(ctx.app).post('/api/auth/register', {
      ...nextUser(),
      username: user.username.toUpperCase(),
    });
    expect(sameUsername.status).toBe(409);
    expect(sameUsername.body.error.code).toBe('USERNAME_TAKEN');
    expect(sameUsername.body.error.details[0].path).toBe('username');

    const sameEmail = await createClient(ctx.app).post('/api/auth/register', {
      ...nextUser(),
      email: user.email.toUpperCase(),
    });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.error.code).toBe('EMAIL_TAKEN');
    expect(sameEmail.body.error.details[0].path).toBe('email');
  });

  it.each([
    ['a short password', { password: 'too short' }, 'password'],
    ['an invalid username', { username: 'no spaces allowed' }, 'username'],
    ['a too-short username', { username: 'ab' }, 'username'],
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['a blank display name', { displayName: '   ' }, 'displayName'],
    ['control characters in the display name', { displayName: 'bad\u0007name' }, 'displayName'],
  ])('rejects %s with a field-level error', async (_label, patch, field) => {
    const res = await createClient(ctx.app).post('/api/auth/register', {
      ...nextUser(),
      ...patch,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.map((detail) => detail.path)).toContain(field);
  });
});

describe('login', () => {
  let ctx;
  let account;
  beforeAll(async () => {
    ctx = await createTestApp();
    account = (await register(ctx)).user;
  });
  afterAll(() => ctx.cleanup());

  it('signs in by email, by username, and case-insensitively', async () => {
    for (const identifier of [account.email, account.username, account.email.toUpperCase()]) {
      const res = await createClient(ctx.app).post('/api/auth/login', {
        identifier,
        password: account.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(account.username);
      expect(cookieValue(res, 'chatify_at')).toBeTruthy();
      expect(cookieValue(res, 'chatify_rt')).toBeTruthy();
    }
  });

  it('gives an identical answer for a wrong password and an unknown account', async () => {
    const client = createClient(ctx.app);
    const wrongPassword = await client.post('/api/auth/login', {
      identifier: account.username,
      password: 'definitely the wrong one',
    });
    const unknownAccount = await client.post('/api/auth/login', {
      identifier: 'no_such_user',
      password: 'definitely the wrong one',
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownAccount.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(cookieValue(wrongPassword, 'chatify_at')).toBeNull();
  });

  it('validates the request body', async () => {
    const res = await createClient(ctx.app).post('/api/auth/login', { identifier: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('account lockout', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp({ LOGIN_MAX_FAILURES: '3', LOGIN_LOCKOUT_MINUTES: '10' });
  });
  afterAll(() => ctx.cleanup());

  it('locks after repeated failures, rejects even the right password, then recovers', async () => {
    const { user } = await register(ctx);
    const client = createClient(ctx.app);
    const wrong = { identifier: user.username, password: 'wrong password here' };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await client.post('/api/auth/login', wrong);
      expect(res.status).toBe(401);
    }

    const locked = await client.post('/api/auth/login', {
      identifier: user.username,
      password: user.password,
    });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(cookieValue(locked, 'chatify_at')).toBeNull();

    await ctx.database.client.execute({
      sql: 'UPDATE users SET locked_until = ? WHERE username = ?',
      args: [Date.now() - 1000, user.username],
    });

    const recovered = await client.post('/api/auth/login', {
      identifier: user.username,
      password: user.password,
    });
    expect(recovered.status).toBe(200);
    const row = await dbRow(
      ctx,
      'SELECT failed_login_count, locked_until FROM users WHERE username = ?',
      [user.username],
    );
    expect(row.failed_login_count).toBe(0);
    expect(row.locked_until).toBeNull();
  });

  it('resets the failure counter after a successful login', async () => {
    const { user } = await register(ctx);
    const client = createClient(ctx.app);
    const wrong = { identifier: user.username, password: 'wrong password here' };

    await client.post('/api/auth/login', wrong);
    await client.post('/api/auth/login', wrong);
    const ok = await client.post('/api/auth/login', {
      identifier: user.username,
      password: user.password,
    });
    expect(ok.status).toBe(200);

    // Two more failures must not lock the account, because the counter restarted.
    await client.post('/api/auth/login', wrong);
    await client.post('/api/auth/login', wrong);
    const stillOpen = await client.post('/api/auth/login', {
      identifier: user.username,
      password: user.password,
    });
    expect(stillOpen.status).toBe(200);
  });
});

describe('rate limiting', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp({ AUTH_RATE_LIMIT_MAX: '3' });
  });
  afterAll(() => ctx.cleanup());

  it('throttles credential endpoints per client with the standard error shape', async () => {
    const client = createClient(ctx.app);
    const attempt = () =>
      client.post('/api/auth/login', { identifier: 'nobody', password: 'whatever password' });

    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).status).toBe(401);
    }
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['ratelimit']).toBeDefined();
  });
});

describe('authenticated access', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  it('rejects requests without a session', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user for a valid session', async () => {
    const { client, user } = await register(ctx);
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it('rejects expired, tampered, and unsigned access tokens', async () => {
    const { res } = await register(ctx);
    const userId = res.body.user.id;
    const valid = cookieValue(res, 'chatify_at');

    const expired = jwt.sign({}, TEST_SECRET, {
      algorithm: 'HS256',
      issuer: 'chatify',
      subject: userId,
      expiresIn: -10,
    });
    const tampered = `${valid.slice(0, -2)}xx`;
    const unsigned = jwt.sign({ sub: userId, iss: 'chatify' }, '', { algorithm: 'none' });

    for (const token of [expired, tampered, unsigned]) {
      const rejected = await request(ctx.app)
        .get('/api/auth/me')
        .set('Cookie', [`chatify_at=${token}`]);
      expect(rejected.status).toBe(401);
      expect(rejected.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const { res } = await register(ctx);
    const token = cookieValue(res, 'chatify_at');
    await ctx.database.client.execute({
      sql: 'DELETE FROM users WHERE id = ?',
      args: [res.body.user.id],
    });
    const rejected = await request(ctx.app)
      .get('/api/auth/me')
      .set('Cookie', [`chatify_at=${token}`]);
    expect(rejected.status).toBe(401);
  });
});

describe('refresh token rotation', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  it('issues a new token pair and revokes the old refresh token', async () => {
    const { client, res: registered } = await register(ctx);
    const first = cookieValue(registered, 'chatify_rt');

    const refreshed = await client.post('/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    const second = cookieValue(refreshed, 'chatify_rt');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(cookieValue(refreshed, 'chatify_at')).toBeTruthy();

    const oldRow = await dbRow(ctx, 'SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?', [
      hashToken(first),
    ]);
    expect(oldRow.revoked_at).not.toBeNull();
    expect((await client.get('/api/auth/me')).status).toBe(200);
  });

  it('treats an immediate replay as a harmless race and keeps the new session alive', async () => {
    const { client, res: registered } = await register(ctx);
    const first = cookieValue(registered, 'chatify_rt');
    const refreshed = await client.post('/api/auth/refresh');
    const second = cookieValue(refreshed, 'chatify_rt');

    const replay = await replayRefresh(ctx, client, first);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_RACE');

    const stillValid = await replayRefresh(ctx, client, second);
    expect(stillValid.status).toBe(200);
  });

  it('lets exactly one of two simultaneous refreshes win', async () => {
    const { client, res: registered } = await register(ctx);
    const token = cookieValue(registered, 'chatify_rt');

    const [a, b] = await Promise.all([
      replayRefresh(ctx, client, token),
      replayRefresh(ctx, client, token),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);
    const loser = a.status === 401 ? a : b;
    expect(loser.body.error.code).toBe('REFRESH_RACE');
  });

  it('revokes every session when a long-revoked token is replayed', async () => {
    const { client, res: registered } = await register(ctx);
    const stolen = cookieValue(registered, 'chatify_rt');
    const refreshed = await client.post('/api/auth/refresh');
    const current = cookieValue(refreshed, 'chatify_rt');

    await ctx.database.client.execute({
      sql: 'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?',
      args: [Date.now() - 60_000, hashToken(stolen)],
    });

    const replay = await replayRefresh(ctx, client, stolen);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_REJECTED');

    const victim = await replayRefresh(ctx, client, current);
    expect(victim.status).toBe(401);
  });

  it('rejects expired, unknown, and missing refresh tokens', async () => {
    const { client, res: registered } = await register(ctx);
    const token = cookieValue(registered, 'chatify_rt');

    await ctx.database.client.execute({
      sql: 'UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?',
      args: [Date.now() - 1000, hashToken(token)],
    });
    const expired = await replayRefresh(ctx, client, token);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('REFRESH_REJECTED');

    const unknown = await replayRefresh(ctx, client, 'never-issued-token');
    expect(unknown.body.error.code).toBe('REFRESH_REJECTED');

    const csrf = await client.csrfToken();
    const missing = await rawPost(ctx.app, '/api/auth/refresh', {
      cookies: [`chatify_csrf=${csrf}`],
      csrf,
    });
    expect(missing.body.error.code).toBe('REFRESH_REJECTED');
  });
});

describe('logout', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  it('revokes the refresh token and clears both cookies', async () => {
    const { client, res: registered } = await register(ctx);
    const token = cookieValue(registered, 'chatify_rt');

    const res = await client.post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(setCookieLine(res, 'chatify_at')).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookieLine(res, 'chatify_rt')).toMatch(/Expires=Thu, 01 Jan 1970/);

    const row = await dbRow(ctx, 'SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?', [
      hashToken(token),
    ]);
    expect(row.revoked_at).not.toBeNull();

    const afterLogout = await client.get('/api/auth/me');
    expect(afterLogout.status).toBe(401);
    const reuse = await replayRefresh(ctx, client, token);
    expect(reuse.status).toBe(401);
  });

  it('succeeds even when there is no session', async () => {
    const res = await createClient(ctx.app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});
