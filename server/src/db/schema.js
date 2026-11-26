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
    // E.164 number, set once the person proves they own it with a code sent by SMS.
    phone: text('phone'),
    phoneVerifiedAt: integer('phone_verified_at', { mode: 'timestamp_ms' }),
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
    uniqueIndex('users_phone_unique').on(table.phone),
    check('users_status_valid', sql`${table.status} IN ('online', 'offline')`),
  ],
);

/** One-time codes sent by SMS to sign in with, or to attach a number to an account. */
export const phoneCodes = sqliteTable(
  'phone_codes',
  {
    id: id(),
    phone: text('phone').notNull(),
    purpose: text('purpose', { enum: ['login', 'link'] }).notNull(),
    // HMAC of the code, never the code itself.
    codeHash: text('code_hash').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('phone_codes_phone_idx').on(table.phone, table.createdAt),
    index('phone_codes_user_id_idx').on(table.userId),
  ],
);

/**
 * Public encryption key of a user, and optionally a backup of the private key that was locked with
 * a passphrase on the device before upload. The server cannot open the backup.
 */
export const userKeys = sqliteTable('user_keys', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  backup: text('backup'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

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
    // One session (device) is a chain of rotated tokens that share a sessionId. Rows written
    // before device management have none, and their own id stands in.
    sessionId: text('session_id'),
    sessionStartedAt: integer('session_started_at', { mode: 'timestamp_ms' }),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    // 'rotated' for a normal refresh, 'device' when the user ended the session from the device list.
    revokedReason: text('revoked_reason'),
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
    // Voice notes: recorded in the app, so they play inline and carry their length.
    isVoice: integer('is_voice', { mode: 'boolean' }).notNull().default(false),
    durationMs: integer('duration_ms'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('attachments_storage_key_unique').on(table.storageKey),
    index('attachments_uploader_id_idx').on(table.uploaderId),
    // Serves the orphan cleanup job, which scans by age.
    index('attachments_created_at_idx').on(table.createdAt),
  ],
);

/** A large upload in progress: bytes arrive in chunks and can resume after a dropped connection. */
export const uploadSessions = sqliteTable(
  'upload_sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // Bytes received so far; the next chunk must start here.
    offsetBytes: integer('offset_bytes').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('upload_sessions_user_id_idx').on(table.userId),
    index('upload_sessions_updated_at_idx').on(table.updatedAt),
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
    // Messages sent from now on vanish this many seconds after sending. Null means they are kept.
    disappearAfterSeconds: integer('disappear_after_seconds'),
    // End-to-end encryption for a direct chat: messages are sent as ciphertext the server cannot read.
    encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
    // A channel is a group where only owners and admins post and everyone else reads.
    broadcast: integer('broadcast', { mode: 'boolean' }).notNull().default(false),
    description: text('description'),
    // Public channels can be found and joined by anyone. Private ones are invitation only.
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('conversations_direct_key_unique').on(table.directKey),
    index('conversations_created_by_idx').on(table.createdBy),
    index('conversations_last_message_at_idx').on(table.lastMessageAt),
    index('conversations_public_channels_idx').on(table.isPublic, table.broadcast),
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
    // The message this one replies to, in the same conversation.
    replyToId: integer('reply_to_id').references(() => messages.id, { onDelete: 'set null' }),
    // Group threads: the top-level message this one answers inside a thread (one level only).
    threadRootId: integer('thread_root_id').references(() => messages.id, { onDelete: 'set null' }),
    // Fixed when the message is sent: its body is ciphertext, whatever the chat does later.
    encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
    forwarded: integer('forwarded', { mode: 'boolean' }).notNull().default(false),
    pinnedAt: integer('pinned_at', { mode: 'timestamp_ms' }),
    // Informational (who pinned it), so no foreign key.
    pinnedBy: text('pinned_by'),
    // Set from the conversation timer when the message is sent; the purge job removes it after this.
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
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
    index('messages_reply_to_id_idx').on(table.replyToId),
    index('messages_expires_at_idx').on(table.expiresAt),
    index('messages_thread_root_idx').on(table.threadRootId, table.id),
    // Serves "pinned messages in this conversation".
    index('messages_conversation_pinned_idx').on(table.conversationId, table.pinnedAt),
  ],
);

/** One reaction per user per message. The key names an icon from a fixed set (see reactions.js). */
export const messageReactions = sqliteTable(
  'message_reactions',
  {
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    index('message_reactions_user_id_idx').on(table.userId),
  ],
);

/** Browser push subscriptions, one per browser profile. */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
    index('push_subscriptions_user_id_idx').on(table.userId),
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

/** Persistent call activity for the participants' history; no signaling/media is stored. */
export const callHistory = sqliteTable(
  'call_history',
  {
    id: id(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    callerId: text('caller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    calleeId: text('callee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    video: integer('video', { mode: 'boolean' }).notNull().default(false),
    outcome: text('outcome', {
      enum: ['missed', 'cancelled', 'declined', 'ended', 'timeout', 'dropped'],
    }),
    endedBy: text('ended_by'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    answeredAt: integer('answered_at', { mode: 'timestamp_ms' }),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('call_history_caller_started_idx').on(table.callerId, table.startedAt),
    index('call_history_callee_started_idx').on(table.calleeId, table.startedAt),
    index('call_history_conversation_idx').on(table.conversationId),
    check(
      'call_history_outcome_valid',
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('missed', 'cancelled', 'declined', 'ended', 'timeout', 'dropped')`,
    ),
  ],
);
