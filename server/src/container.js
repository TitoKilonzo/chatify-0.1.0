import { createAuthService } from './modules/auth/auth.service.js';
import { createSessionCookies } from './modules/auth/cookies.js';
import { createPasswordHasher } from './modules/auth/password.js';
import { createRefreshTokensRepository } from './modules/auth/refresh-tokens.repository.js';
import { createAccessTokens } from './modules/auth/tokens.js';
import { createAttachmentsRepository } from './modules/attachments/attachments.repository.js';
import { createAttachmentsService } from './modules/attachments/attachments.service.js';
import { createConversationsRepository } from './modules/conversations/conversations.repository.js';
import { createConversationsService } from './modules/conversations/conversations.service.js';
import { createPushRepository } from './modules/push/push.repository.js';
import { createPushService } from './modules/push/push.service.js';
import { createMessagesRepository } from './modules/messages/messages.repository.js';
import { createMessagesService } from './modules/messages/messages.service.js';
import { createUsersRepository } from './modules/users/users.repository.js';
import { createUsersService } from './modules/users/users.service.js';
import { createStorage } from './storage/index.js';
import { createEventBus } from './utils/events.js';

/**
 * Composition root: builds every repository and service once and wires them together.
 * Both the HTTP app and the realtime layer receive the same container, so they share one event
 * bus and one set of business rules.
 */
export function createContainer({
  env,
  logger,
  database,
  passwordHashOptions,
  storageOverride,
  pushSender,
}) {
  const { db } = database;
  const events = createEventBus({
    onError: (err, event) => logger.error({ err, event }, 'event handler failed'),
  });

  const accessTokens = createAccessTokens({
    secret: env.JWT_ACCESS_SECRET,
    ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  });
  const sessionCookies = createSessionCookies({
    isProduction: env.isProduction,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
  });
  const storage = storageOverride ?? createStorage(env);

  const usersRepository = createUsersRepository(db);
  const refreshTokensRepository = createRefreshTokensRepository(db);
  const conversationsRepository = createConversationsRepository(db);
  const messagesRepository = createMessagesRepository(db);
  const attachmentsRepository = createAttachmentsRepository(db);

  const authService = createAuthService({
    usersRepository,
    refreshTokensRepository,
    hasher: createPasswordHasher(passwordHashOptions),
    accessTokens,
    events,
    config: {
      refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
      maxLoginFailures: env.LOGIN_MAX_FAILURES,
      lockoutMinutes: env.LOGIN_LOCKOUT_MINUTES,
    },
  });
  const usersService = createUsersService({ usersRepository, events });
  const attachmentsService = createAttachmentsService({
    attachmentsRepository,
    conversationsRepository,
    usersRepository,
    storage,
    logger,
  });
  const conversationsService = createConversationsService({
    conversationsRepository,
    messagesRepository,
    usersRepository,
    events,
  });
  const messagesService = createMessagesService({
    conversationsRepository,
    messagesRepository,
    attachmentsRepository,
    attachmentsService,
    events,
    logger,
  });

  const pushService = createPushService({
    env,
    repository: createPushRepository(db),
    conversationsRepository,
    events,
    logger,
    sender: pushSender,
  });
  pushService.start();

  return {
    pushService,
    events,
    accessTokens,
    sessionCookies,
    storage,
    usersRepository,
    refreshTokensRepository,
    conversationsRepository,
    messagesRepository,
    attachmentsRepository,
    authService,
    usersService,
    attachmentsService,
    conversationsService,
    messagesService,
  };
}
