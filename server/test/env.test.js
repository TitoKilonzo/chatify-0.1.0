import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const BASE = { JWT_ACCESS_SECRET: 'a'.repeat(32) };

describe('parseEnv', () => {
  it('applies defaults for a minimal environment', () => {
    const env = parseEnv(BASE);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_SECONDS).toBe(604800);
    expect(env.LOGIN_MAX_FAILURES).toBe(5);
    expect(env.LOGIN_LOCKOUT_MINUTES).toBe(15);
    expect(env.AUTH_RATE_LIMIT_MAX).toBe(30);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.isProduction).toBe(false);
  });

  it('requires a signing secret of at least 32 characters', () => {
    expect(() => parseEnv({})).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => parseEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('coerces PORT and flags production', () => {
    const env = parseEnv({
      ...BASE,
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'libsql://chatify-example.turso.io',
      DATABASE_AUTH_TOKEN: 'token',
    });
    expect(env.PORT).toBe(8080);
    expect(env.isProduction).toBe(true);
  });

  it('defaults to a local libSQL file with no auth token', () => {
    const env = parseEnv(BASE);
    expect(env.DATABASE_URL).toBe('file:./data/chatify.db');
    expect(env.DATABASE_AUTH_TOKEN).toBeUndefined();
  });

  it('treats an empty DATABASE_AUTH_TOKEN as unset', () => {
    expect(parseEnv({ ...BASE, DATABASE_AUTH_TOKEN: '' }).DATABASE_AUTH_TOKEN).toBeUndefined();
  });

  it('requires an auth token for a remote database', () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: 'libsql://chatify-example.turso.io' })).toThrow(
      /DATABASE_AUTH_TOKEN/,
    );
  });

  it('refuses a local file database in production', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('splits and trims a comma-separated origin list', () => {
    const env = parseEnv({
      ...BASE,
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com:8443',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.example.com', 'https://b.example.com:8443']);
  });

  it('rejects origins that carry a path or trailing slash', () => {
    expect(() => parseEnv({ ...BASE, CORS_ORIGINS: 'https://a.example.com/' })).toThrow(
      /CORS_ORIGINS/,
    );
    expect(() => parseEnv({ ...BASE, CORS_ORIGINS: 'https://a.example.com/app' })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it('rejects out-of-range numeric settings', () => {
    expect(() => parseEnv({ ...BASE, ACCESS_TOKEN_TTL_SECONDS: '5' })).toThrow(
      /ACCESS_TOKEN_TTL_SECONDS/,
    );
    expect(() => parseEnv({ ...BASE, LOGIN_MAX_FAILURES: '0' })).toThrow(/LOGIN_MAX_FAILURES/);
  });

  it('reports every invalid variable in one error', () => {
    expect(() => parseEnv({ ...BASE, PORT: '99999', LOG_LEVEL: 'loud' })).toThrow(
      /PORT[\s\S]*LOG_LEVEL|LOG_LEVEL[\s\S]*PORT/,
    );
  });
});
