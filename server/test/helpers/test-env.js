import { parseEnv } from '../../src/config/env.js';

export const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';
export const TEST_ORIGIN = 'https://chat.example.com';

/** Parsed test environment. Rate limits are high by default so tests do not trip them by accident. */
export function testEnv(overrides = {}) {
  return parseEnv({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: TEST_SECRET,
    CORS_ORIGINS: TEST_ORIGIN,
    AUTH_RATE_LIMIT_MAX: '1000',
    ...overrides,
  });
}
