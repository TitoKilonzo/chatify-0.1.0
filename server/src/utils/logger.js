import pino from 'pino';

/**
 * Structured logger. Sensitive fields are redacted as a safety net; the real policy is to never
 * pass passwords, tokens, or message bodies to the logger in the first place.
 */
export function createLogger({ LOG_LEVEL, NODE_ENV }) {
  return pino({
    level: NODE_ENV === 'test' ? 'silent' : LOG_LEVEL,
    base: { service: 'chatify-server' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.refreshToken',
        '*.body',
      ],
      censor: '[redacted]',
    },
  });
}
