import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/*
 * Conventions
 * - Ids of users, conversations, attachments, and tokens are random UUID strings.
 * - messages.id is an autoincrement integer. It is the monotonic tiebreaker that, together with
 *   created_at, defines message order and the pagination cursor (created_at, id).
 * - Timestamps are integer milliseconds since the epoch, exposed as Date objects.
 * - username and email are stored lower-cased by the service layer so the unique constraints
 *   are effectively case-insensitive.
 */

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable(
  'users',
  {
    id: id(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    avatarPath: text('avatar_path'),
    status: text('status', { enum: ['online', 'offline'] })
      .notNull()
      .default('offline'),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    // Consecutive failed logins since the last success or lock. Drives account lockout.
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_email_unique').on(table.email),
    check('users_status_valid', sql`${table.status} IN ('online', 'offline')`),
  ],
);

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_token_hash_unique').on(table.tokenHash),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: id(),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    thumbnailKey: text('thumbnail_key'),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('attachments_storage_key_unique').on(table.storageKey),
    index('attachments_uploader_id_idx').on(table.uploaderId),
    // Serves the orphan cleanup job, which scans by age.
    index('attachments_created_at_idx').on(table.createdAt),
  ],
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: id(),
    type: text('type', { enum: ['direct', 'group'] }).notNull(),
    name: text('name'),
    avatarPath: text('avatar_path'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    // Sorted pair of user ids joined by a colon. Unique, so two users have at most one direct chat.
    directKey: text('direct_key'),
    // Denormalized activity timestamp so the conversation list sorts without scanning messages.
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('conversations_direct_key_unique').on(table.directKey),
    index('conversations_created_by_idx').on(table.createdBy),
    index('conversations_last_message_at_idx').on(table.lastMessageAt),
    check(
      'conversations_direct_key_matches_type',
      sql`(${table.type} = 'direct' AND ${table.directKey} IS NOT NULL) OR (${table.type} = 'group' AND ${table.directKey} IS NULL)`,
    ),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id),
    // Client-generated id that makes retries idempotent.
    clientId: text('client_id').notNull(),
    body: text('body').notNull().default(''),
    attachmentId: text('attachment_id').references(() => attachments.id, { onDelete: 'set null' }),
    editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('messages_sender_client_unique').on(table.senderId, table.clientId),
    // Serves cursor pagination on (created_at, id) within a conversation.
    index('messages_conversation_cursor_idx').on(table.conversationId, table.createdAt, table.id),
    // Serves reconnect sync (id > afterId) and unread counts within a conversation.
    index('messages_conversation_id_idx').on(table.conversationId, table.id),
    index('messages_sender_id_idx').on(table.senderId),
    // One attachment belongs to at most one message.
    uniqueIndex('messages_attachment_id_unique').on(table.attachmentId),
  ],
);

export const conversationMembers = sqliteTable(
  'conversation_members',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'admin', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastReadMessageId: integer('last_read_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    mutedAt: integer('muted_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    // Serves "list my conversations" and the archived filter.
    index('conversation_members_user_idx').on(table.userId, table.archivedAt),
    index('conversation_members_last_read_idx').on(table.lastReadMessageId),
    check('conversation_members_role_valid', sql`${table.role} IN ('owner', 'admin', 'member')`),
  ],
);

export const messageReceipts = sqliteTable(
  'message_receipts',
  {
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index('message_receipts_user_id_idx').on(table.userId),
  ],
);
