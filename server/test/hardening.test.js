import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { parseEnv } from '../src/config/env.js';
import { createTestApp, signUp } from './helpers/test-app.js';

describe('response hardening', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.cleanup());

  it('sends a strict content security policy', async () => {
    const res = await request(ctx.app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('wss://chat.example.com');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('marks API responses as uncacheable', async () => {
    const user = await signUp(ctx.app);
    const res = await user.client.get('/api/conversations');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers unknown API paths with the JSON 404 shape', async () => {
    const res = await request(ctx.app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('single-origin static serving', () => {
  let ctx;
  let dist;
  beforeAll(async () => {
    dist = await mkdtemp(path.join(os.tmpdir(), 'chatify-dist-'));
    await mkdir(path.join(dist, 'assets'));
    await writeFile(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
    await writeFile(path.join(dist, 'assets', 'app-abc.js'), 'void 0;');
    await writeFile(path.join(dist, 'sw.js'), 'void 0;');
    await writeFile(path.join(dist, 'manifest.webmanifest'), '{"name":"Chatify"}');
    await writeFile(path.join(dist, 'robots.txt'), 'User-agent: *\n');
    ctx = await createTestApp({ CLIENT_DIST_DIR: dist });
  });
  afterAll(async () => {
    await ctx.cleanup();
    await rm(dist, { recursive: true, force: true });
  });

  it('serves the app shell for client-side routes', async () => {
    const res = await request(ctx.app).get('/chats/some-id');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('caches hashed assets for a year', async () => {
    const res = await request(ctx.app).get('/assets/app-abc.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('serves the service worker uncached and from the site root', async () => {
    const res = await request(ctx.app).get('/sw.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves the web app manifest with its own media type', async () => {
    const res = await request(ctx.app).get('/manifest.webmanifest');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/manifest\+json/);
  });

  it('serves public pages and static files without a session', async () => {
    for (const route of ['/', '/about', '/features', '/help', '/contact', '/privacy', '/terms']) {
      const res = await request(ctx.app).get(route);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    }
    const robots = await request(ctx.app).get('/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.headers['content-type']).toMatch(/text\/plain/);
  });

  it('answers 404, not the app shell, for missing files and stale assets', async () => {
    for (const missing of ['/assets/app-old123.js', '/assets/missing.css', '/logo.png', '/x.map']) {
      const res = await request(ctx.app).get(missing);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).not.toMatch(/html/);
    }
    // Extensionless client routes still get the shell, including ones with a dot-free path.
    expect((await request(ctx.app).get('/chats/abc')).status).toBe(200);
  });

  it('keeps API and socket paths out of the SPA fallback', async () => {
    const api = await request(ctx.app).get('/api/nope');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toMatch(/json/);
  });
});

describe('upload configuration', () => {
  const base = {
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
  };
  it('has safe defaults', () => {
    const env = parseEnv(base);
    expect(env.UPLOAD_DIR).toBe('./data/uploads');
    expect(env.MAX_UPLOAD_BYTES).toBe(26214400);
    expect(env.CLIENT_DIST_DIR).toBeUndefined();
  });
  it('rejects an absurdly small upload limit', () => {
    expect(() => parseEnv({ ...base, MAX_UPLOAD_BYTES: '10' })).toThrow(/MAX_UPLOAD_BYTES/);
  });
});
