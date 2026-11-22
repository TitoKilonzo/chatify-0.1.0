import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { uniqueViolation } from '../src/db/errors.js';
import { createCsrf } from '../src/middleware/csrf.js';
import { createPasswordHasher } from '../src/modules/auth/password.js';
import { createAccessTokens, generateRefreshToken, hashToken } from '../src/modules/auth/tokens.js';
import { TEST_SECRET } from './helpers/test-env.js';

const CHEAP = { memoryCost: 1024, timeCost: 1, parallelism: 1 };

describe('password hasher', () => {
  const hasher = createPasswordHasher(CHEAP);

  it('produces argon2id hashes that verify only the right password', async () => {
    const hash = await hasher.hash('a long enough password');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 'a long enough password')).toBe(true);
    expect(await hasher.verify(hash, 'a different password')).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([hasher.hash('same password'), hasher.hash('same password')]);
    expect(a).not.toBe(b);
  });

  it('never authenticates against a malformed stored hash', async () => {
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
    expect(await hasher.verify('', 'anything')).toBe(false);
  });

  it('supports the timing-equalisation path', async () => {
    await expect(hasher.verifyDummy('whatever')).resolves.toBeUndefined();
  });
});

describe('access tokens', () => {
  const tokens = createAccessTokens({ secret: TEST_SECRET, ttlSeconds: 900 });

  it('round-trips a user id', () => {
    expect(tokens.verify(tokens.sign('user-1'))).toBe('user-1');
  });

  it('rejects tokens signed with another secret', () => {
    const other = createAccessTokens({ secret: 'x'.repeat(40), ttlSeconds: 900 });
    expect(tokens.verify(other.sign('user-1'))).toBeNull();
  });

  it('rejects expired tokens', () => {
    const expired = jwt.sign({}, TEST_SECRET, {
      algorithm: 'HS256',
      issuer: 'chatify',
      subject: 'user-1',
      expiresIn: -10,
    });
    expect(tokens.verify(expired)).toBeNull();
  });

  it('rejects unsigned "none" algorithm tokens', () => {
    const unsigned = jwt.sign({ sub: 'user-1', iss: 'chatify' }, '', { algorithm: 'none' });
    expect(tokens.verify(unsigned)).toBeNull();
  });

  it('rejects tokens from a different issuer and malformed input', () => {
    const foreign = jwt.sign({}, TEST_SECRET, { subject: 'user-1', issuer: 'someone-else' });
    expect(tokens.verify(foreign)).toBeNull();
    expect(tokens.verify('garbage')).toBeNull();
    expect(tokens.verify('')).toBeNull();
  });
});

describe('refresh token helpers', () => {
  it('generates unique, url-safe tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically to 64 hex characters without revealing the token', () => {
    const token = generateRefreshToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('csrf tokens', () => {
  const csrf = createCsrf({ secret: TEST_SECRET, allowedOrigins: [], isProduction: false });

  it('accepts tokens it issued', () => {
    expect(csrf.isValidToken(csrf.issueToken())).toBe(true);
  });

  it('rejects tampered, unsigned, and malformed tokens', () => {
    const [value, signature] = csrf.issueToken().split('.');
    expect(csrf.isValidToken(`${value}x.${signature}`)).toBe(false);
    expect(csrf.isValidToken(`${value}.`)).toBe(false);
    expect(csrf.isValidToken(value)).toBe(false);
    expect(csrf.isValidToken(`${value}.${signature}.extra`)).toBe(false);
    expect(csrf.isValidToken(undefined)).toBe(false);
  });

  it('rejects tokens signed with a different secret', () => {
    const other = createCsrf({ secret: 'y'.repeat(40), allowedOrigins: [], isProduction: false });
    expect(csrf.isValidToken(other.issueToken())).toBe(false);
  });

  it('reuses a valid cookie token and replaces an invalid one', () => {
    const issued = [];
    const res = { cookie: (name, value) => issued.push([name, value]) };

    const valid = csrf.issueToken();
    expect(csrf.ensureToken({ cookies: { chatify_csrf: valid } }, res)).toBe(valid);
    expect(issued).toHaveLength(0);

    const replaced = csrf.ensureToken({ cookies: { chatify_csrf: 'forged.value' } }, res);
    expect(csrf.isValidToken(replaced)).toBe(true);
    expect(issued).toHaveLength(1);
  });
});

describe('uniqueViolation', () => {
  it('extracts the table and column from a SQLite message', () => {
    expect(uniqueViolation(new Error('UNIQUE constraint failed: users.email'))).toEqual({
      table: 'users',
      column: 'email',
    });
  });

  it('finds the message inside a wrapped cause chain', () => {
    const inner = new Error('SQLite error: UNIQUE constraint failed: users.username');
    const outer = new Error('Failed query', { cause: inner });
    expect(uniqueViolation(outer)).toEqual({ table: 'users', column: 'username' });
  });

  it('returns null for unrelated errors', () => {
    expect(uniqueViolation(new Error('boom'))).toBeNull();
    expect(uniqueViolation(null)).toBeNull();
  });
});
