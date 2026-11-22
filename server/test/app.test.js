import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/utils/logger.js';
import { createErrorHandler } from '../src/middleware/error-handler.js';
import { validate } from '../src/middleware/validate.js';
import { createTestDatabase } from './helpers/test-db.js';
import { testEnv } from './helpers/test-env.js';

const env = testEnv();
const logger = createLogger(env);

describe('app', () => {
  let testDb;
  let app;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = createApp({ env, logger, database: testDb });
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('serves the health endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('reports 503 when the database is unreachable', async () => {
    const brokenDatabase = {
      client: {
        execute: () => Promise.reject(new Error('connection lost')),
      },
    };
    const brokenApp = createApp({ env, logger, database: brokenDatabase });
    const res = await request(brokenApp).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'down' });
  });

  it('returns the JSON error shape for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('rejects malformed JSON with a 400', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects oversized bodies with a 413', async () => {
    const res = await request(app)
      .post('/api/health')
      .send({ filler: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows credentialed requests from listed origins only', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'https://chat.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://chat.example.com');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('validate middleware', () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
      body: z.object({ name: z.string().min(1) }),
    }),
    (req, res) => res.json(req.validated),
  );
  testApp.use(createErrorHandler(logger));

  it('exposes parsed and coerced values on req.validated', async () => {
    const res = await request(testApp).post('/items/7?limit=5').send({ name: 'box' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id: '7' }, query: { limit: 5 }, body: { name: 'box' } });
  });

  it('applies schema defaults', async () => {
    const res = await request(testApp).post('/items/7').send({ name: 'box' });
    expect(res.body.query.limit).toBe(20);
  });

  it('returns field-level details on failure', async () => {
    const res = await request(testApp).post('/items/abc').send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'id' })]),
    );
  });

  it('treats a missing body as a validation failure', async () => {
    const res = await request(testApp).post('/items/7');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
