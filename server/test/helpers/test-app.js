import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { io as connectClient } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { attachRealtime } from '../../src/realtime/index.js';
import { createLogger } from '../../src/utils/logger.js';
import { createTestDatabase } from './test-db.js';
import { testEnv } from './test-env.js';

// Cheap argon2 parameters keep the suite fast; production uses the defaults.
const CHEAP_HASH_OPTIONS = { memoryCost: 1024, timeCost: 1, parallelism: 1 };

/** Build an isolated app with its own migrated database. Call cleanup() in afterAll. */
export async function createTestApp(
  envOverrides = {},
  { storage, pushSender, smsOverride, callsOptions } = {},
) {
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'chatify-uploads-'));
  const env = testEnv({ UPLOAD_DIR: uploadDir, ...envOverrides });
  const database = await createTestDatabase();
  const logger = createLogger(env);
  const app = createApp({
    env,
    logger,
    database,
    passwordHashOptions: CHEAP_HASH_OPTIONS,
    storage,
    pushSender,
    smsOverride,
    callsOptions,
  });
  return {
    app,
    env,
    logger,
    database,
    container: app.locals.container,
    async cleanup() {
      await database.cleanup();
      await rm(uploadDir, { recursive: true, force: true });
    },
  };
}

/** Read a cookie value from a response's Set-Cookie headers, or null when it was not set. */
export function cookieValue(res, name) {
  for (const line of res.headers['set-cookie'] ?? []) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    if (pair.slice(0, index).trim() === name) {
      return decodeURIComponent(pair.slice(index + 1));
    }
  }
  return null;
}

/** The raw Set-Cookie header line for a cookie, for asserting attributes. */
export function setCookieLine(res, name) {
  return (res.headers['set-cookie'] ?? []).find((line) => line.startsWith(`${name}=`)) ?? null;
}

/**
 * A cookie-keeping HTTP client that behaves like the browser app: it fetches a CSRF token once
 * and sends it on every state-changing request.
 */
export function createClient(app) {
  const agent = request.agent(app);
  let csrfToken = null;

  async function token() {
    if (!csrfToken) {
      const res = await agent.get('/api/auth/csrf');
      csrfToken = res.body.csrfToken;
    }
    return csrfToken;
  }

  return {
    agent,
    csrfToken: token,
    get: (url) => agent.get(url),
    // The token must be fetched before the request object is created: superagent agents attach
    // cookies at creation time, so building the request first would omit the CSRF cookie.
    post: async (url, body) => {
      const csrf = await token();
      return agent.post(url).set('X-CSRF-Token', csrf).send(body);
    },
    patch: async (url, body) => {
      const csrf = await token();
      return agent.patch(url).set('X-CSRF-Token', csrf).send(body);
    },
    put: async (url, body) => {
      const csrf = await token();
      return agent.put(url).set('X-CSRF-Token', csrf).send(body);
    },
    delete: async (url, body) => {
      const csrf = await token();
      const req = agent.delete(url).set('X-CSRF-Token', csrf);
      return body === undefined ? req : req.send(body);
    },
    /** PATCH a raw binary body with extra headers (resumable upload chunks). */
    patchRaw: async (url, buffer, headers = {}) => {
      const csrf = await token();
      return agent
        .patch(url)
        .set('X-CSRF-Token', csrf)
        .set('Content-Type', 'application/octet-stream')
        .set(headers)
        .send(buffer);
    },
    /** Multipart upload of one in-memory file. method is 'post' or 'put'. */
    upload: async (
      url,
      buffer,
      filename,
      { method = 'post', field = 'file', fields = {} } = {},
    ) => {
      const csrf = await token();
      const req = agent[method](url).set('X-CSRF-Token', csrf);
      for (const [name, value] of Object.entries(fields)) {
        req.field(name, value);
      }
      return req.attach(field, buffer, filename);
    },
  };
}

/** Send a request with explicit cookies and CSRF token, bypassing any cookie jar. */
export async function rawPost(app, url, { cookies = [], csrf, body } = {}) {
  const req = request(app).post(url).set('Cookie', cookies);
  if (csrf) {
    req.set('X-CSRF-Token', csrf);
  }
  return req.send(body);
}

export function validUser(n) {
  return {
    displayName: `Test User ${n}`,
    username: `user_${n}`,
    email: `user${n}@example.com`,
    password: 'correct horse battery',
  };
}

let userCounter = 5000;

/** Register a fresh user. Returns the client, the user object, the id, and a Cookie header value. */
export async function signUp(app, label = 'u') {
  const client = createClient(app);
  userCounter += 1;
  const credentials = {
    ...validUser(userCounter),
    username: `${label}_${userCounter}`,
    displayName: `${label} ${userCounter}`,
  };
  const res = await client.post('/api/auth/register', credentials);
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookie = ['chatify_at', 'chatify_rt']
    .map((name) => `${name}=${encodeURIComponent(cookieValue(res, name))}`)
    .join('; ');
  return { client, credentials, id: res.body.user.id, user: res.body.user, cookie };
}

/** Start the app on an ephemeral port with Socket.io attached. */
export async function startRealtime(ctx) {
  const server = http.createServer(ctx.app);
  const realtime = await attachRealtime({
    server,
    env: ctx.env,
    logger: ctx.logger,
    container: ctx.container,
    presenceGraceMs: 250,
    typingTtlMs: 300,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    realtime,
    close: () => realtime.close(),
  };
}

/** Open an authenticated socket using a user's cookies. Rejects with the handshake error code. */
export function connectSocket(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = connectClient(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: cookie ? { cookie } : {},
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(new Error(err.message));
    });
  });
}

/** Resolve with the first payload of an event, or reject after timeoutMs. */
export function waitFor(socket, event, { timeoutMs = 3000, predicate = () => true } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
    }
    socket.on(event, handler);
  });
}

/** Emit with an acknowledgement and resolve with the ack payload. */
export function emitAck(socket, event, payload, timeoutMs = 3000) {
  return socket.timeout(timeoutMs).emitWithAck(event, payload);
}

/** True when no matching event arrives within windowMs. */
export async function expectSilence(socket, event, windowMs = 300) {
  let received = false;
  const handler = () => {
    received = true;
  };
  socket.on(event, handler);
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  socket.off(event, handler);
  return !received;
}
