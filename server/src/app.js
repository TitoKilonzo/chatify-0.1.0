import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { createKeysRouter } from './modules/keys/keys.routes.js';
import { createPhoneRouter } from './modules/phone/phone.routes.js';
import { createUploadsRouter } from './modules/uploads/uploads.routes.js';
import { createPushRouter } from './modules/push/push.routes.js';
import { storageOrigin } from './storage/index.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createContainer } from './container.js';
import { pingDatabase } from './db/client.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createAttachmentsController } from './modules/attachments/attachments.controller.js';
import {
  createAttachmentsRouter,
  createGroupAvatarRouter,
} from './modules/attachments/attachments.routes.js';
import { createSingleFileUpload } from './modules/attachments/upload.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createConversationsController } from './modules/conversations/conversations.controller.js';
import { createConversationsRouter } from './modules/conversations/conversations.routes.js';
import { createMessagesController } from './modules/messages/messages.controller.js';
import {
  createConversationMessagesRouter,
  createMessagesRouter,
} from './modules/messages/messages.routes.js';
import { createUsersController } from './modules/users/users.controller.js';
import { createUsersRouter } from './modules/users/users.routes.js';
import { createRequireAuth } from './middleware/auth.js';
import { createCsrf } from './middleware/csrf.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { createRequestLogger } from './middleware/request-logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';

const JSON_BODY_LIMIT = '100kb';
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
// Refreshing is automatic and frequent, so it gets a more generous fixed ceiling than credentials.
const REFRESH_RATE_LIMIT = 120;

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const ASSET_CACHE = 'public, max-age=31536000, immutable';

/** Content-Security-Policy that lets the SPA talk to its API and websocket and nothing else. */
function contentSecurityPolicy(env) {
  // With cloud storage, images and media are loaded from short-lived signed URLs on its origin.
  const cloud = storageOrigin(env);
  const cloudSources = cloud ? [cloud] : [];
  const sockets = env.CORS_ORIGINS.map((origin) => origin.replace(/^http/, 'ws'));
  return {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // React sets inline style attributes for virtualized lists, so inline styles are allowed.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', ...cloudSources],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...env.CORS_ORIGINS, ...sockets],
      mediaSrc: ["'self'", 'blob:', ...cloudSources],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  };
}

/**
 * Build the Express application. Dependencies are injected so tests can create isolated apps.
 * passwordHashOptions lets tests use cheap argon2 parameters. The composed container is exposed
 * on app.locals.container so the realtime layer shares the same services and event bus.
 */
export function createApp({
  env,
  logger,
  database,
  passwordHashOptions,
  storage,
  pushSender,
  smsOverride,
}) {
  const app = express();
  const container = createContainer({
    env,
    logger,
    database,
    passwordHashOptions,
    storageOverride: storage,
    pushSender,
    smsOverride,
  });
  app.locals.container = container;

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: contentSecurityPolicy(env),
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      // Strict allow-list: an origin not listed here receives no CORS headers at all.
      origin: env.CORS_ORIGINS,
      credentials: true,
      maxAge: 600,
    }),
  );
  app.use(createRequestLogger(logger));
  app.use(cookieParser());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // API responses carry per-user data and must never be stored by shared caches.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const csrf = createCsrf({
    secret: env.JWT_ACCESS_SECRET,
    allowedOrigins: env.CORS_ORIGINS,
    isProduction: env.isProduction,
  });
  app.use('/api', csrf.protect);

  const requireAuth = createRequireAuth({ accessTokens: container.accessTokens });
  const credentialLimiter = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
  });
  const refreshLimiter = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: REFRESH_RATE_LIMIT,
  });
  const sendLimiter = createRateLimiter({ windowMs: 60_000, limit: 120 });
  const uploadLimiter = createRateLimiter({ windowMs: 10 * 60_000, limit: 60 });
  const chunkLimiter = createRateLimiter({ windowMs: 60_000, limit: 600 });
  const searchLimiter = createRateLimiter({ windowMs: 60_000, limit: 60 });

  const fileUpload = createSingleFileUpload({ maxBytes: env.MAX_UPLOAD_BYTES });
  const avatarUpload = createSingleFileUpload({ maxBytes: AVATAR_MAX_BYTES });

  const attachmentsController = createAttachmentsController({
    attachmentsService: container.attachmentsService,
  });
  const messagesController = createMessagesController({
    messagesService: container.messagesService,
  });

  app.use('/api/health', createHealthRouter({ ping: () => pingDatabase(database.client), logger }));
  app.use(
    '/api/auth',
    createAuthRouter({
      controller: createAuthController({
        authService: container.authService,
        sessionCookies: container.sessionCookies,
        csrf,
      }),
      requireAuth,
      credentialLimiter,
      refreshLimiter,
    }),
  );
  app.use('/api/keys', createKeysRouter({ keysRepository: container.keysRepository, requireAuth }));
  app.use(
    '/api/phone',
    createPhoneRouter({
      phoneService: container.phoneService,
      sessionCookies: container.sessionCookies,
      requireAuth,
      credentialLimiter,
    }),
  );
  app.use(
    '/api/users',
    createUsersRouter({
      controller: createUsersController({
        usersService: container.usersService,
        authService: container.authService,
        sessionCookies: container.sessionCookies,
      }),
      attachmentsController,
      avatarUpload,
      uploadLimiter,
      requireAuth,
      credentialLimiter,
    }),
  );
  app.use('/api/push', createPushRouter({ pushService: container.pushService, requireAuth }));
  app.use(
    '/api/conversations',
    requireAuth,
    createConversationsRouter({
      controller: createConversationsController({
        conversationsService: container.conversationsService,
      }),
      extraRouters: [
        createConversationMessagesRouter({ controller: messagesController, sendLimiter }),
        createGroupAvatarRouter({ controller: attachmentsController, avatarUpload, uploadLimiter }),
      ],
    }),
  );
  app.use(
    '/api',
    createMessagesRouter({
      controller: messagesController,
      requireAuth,
      sendLimiter,
      searchLimiter,
    }),
  );
  app.use(
    '/api/uploads',
    requireAuth,
    createUploadsRouter({
      uploadsService: container.uploadsService,
      uploadLimiter,
      chunkLimiter,
    }),
  );
  app.use(
    '/api/attachments',
    requireAuth,
    createAttachmentsRouter({
      controller: attachmentsController,
      upload: fileUpload,
      uploadLimiter,
    }),
  );

  if (env.CLIENT_DIST_DIR) {
    mountClient(app, path.resolve(env.CLIENT_DIST_DIR));
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

/** Serve the built SPA and fall back to index.html for client-side routes. */
function mountClient(app, distDir) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.set('Cache-Control', ASSET_CACHE);
        } else if (path.basename(filePath) === 'sw.js') {
          // The service worker must be re-checked on every load or updates would never arrive.
          res.set('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    const isPage = req.method === 'GET' || req.method === 'HEAD';
    if (!isPage || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    // A missing file (a hashed asset from an older deploy, a stray .map or .png) must be a real
    // 404. Answering with index.html would make browsers try to run HTML as JavaScript.
    if (req.path.startsWith('/assets/') || path.extname(req.path) !== '') {
      next();
      return;
    }
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'), (err) => err && next(err));
  });
}
