import rateLimit from 'express-rate-limit';
import { tooManyRequests } from '../utils/errors.js';

/**
 * Per-IP rate limiter that reports through the central error handler so the response keeps the
 * standard JSON error shape. Counters live in process memory: with several server instances each
 * keeps its own count, so back this with a shared store if you scale horizontally.
 */
export function createRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(tooManyRequests('RATE_LIMITED', 'Too many requests, please try again later'));
    },
  });
}
