import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../src/db/migrate.js';
import {
  attachments,
  conversationMembers,
  conversations,
  messageReceipts,
  messages,
  refreshTokens,
  users,
} from '../src/db/schema.js';
import { createTestDatabase } from './helpers/test-db.js';

const EXPECTED_TABLES = [
  'attachments',
  'conversation_members',
  'conversations',
  'message_reactions',
  'message_receipts',
  'messages',
  'push_subscriptions',
  'refresh_tokens',
  'users',
];

let testDb;
let db;
let counter = 0;

async function makeUser(overrides = {}) {
  counter += 1;
  const [user] = await db
    .insert(users)
    .values({
      username: `user${counter}`,
      email: `user${counter}@example.com`,
      displayName: `User ${counter}`,
      passwordHash: 'hash',
      ...overrides,
    })
    .returning();
  return user;
}

async function makeGroup(creator) {
  const [conversation] = await db
    .insert(conversations)
    .values({ type: 'group', name: 'Group', createdBy: creator.id })
    .returning();
  return conversation;
}

async function makeMessage(conversation, sender, clientId) {
  const [message] = await db
    .insert(messages)
    .values({ conversationId: conversation.id, senderId: sender.id, clientId, body: 'text' })
    .returning();
  return message;
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = testDb.db;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('migrations', () => {
  it('create every table in the specification', async () => {
    const result = await testDb.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%drizzle%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(result.rows.map((row) => row.name)).toEqual(EXPECTED_TABLES);
  });

  it('can be applied again without error', async () => {
    await expect(runMigrations(db)).resolves.toBeUndefined();
  });

  it('give every foreign key column a covering index', async () => {
    const missing = [];
    for (const table of EXPECTED_TABLES) {
      const fks = await testDb.client.execute(`PRAGMA foreign_key_list(${table})`);
      const indexList = await testDb.client.execute(`PRAGMA index_list(${table})`);

      const leadingColumns = new Set();
      for (const index of indexList.rows) {
        const info = await testDb.client.execute(`PRAGMA index_info(${index.name})`);
        const first = info.rows.find((row) => Number(row.seqno) === 0);
        if (first) {
          leadingColumns.add(first.name);
        }
      }

      for (const fk of fks.rows) {
        if (!leadingColumns.has(fk.from)) {
          missing.push(`${table}.${fk.from}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('constraints', () => {
  it('enforce foreign keys, including inside transactions', async () => {
    const user = await makeUser();
    await expect(
      db.insert(messages).values({
        conversationId: 'missing-conversation',
        senderId: user.id,
        clientId: 'c-fk',
        body: 'x',
      }),
    ).rejects.toThrow();

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(messages).values({
          conversationId: 'missing-conversation',
          senderId: user.id,
          clientId: 'c-fk-tx',
          body: 'x',
        });
      }),
    ).rejects.toThrow();
  });

  it('reject duplicate usernames and emails', async () => {
    const user = await makeUser();
    await expect(makeUser({ username: user.username })).rejects.toThrow();
    await expect(makeUser({ email: user.email })).rejects.toThrow();
  });

  it('make (sender, client id) unique so retries are idempotent', async () => {
    const sender = await makeUser();
    const other = await makeUser();
    const conversation = await makeGroup(sender);

    await makeMessage(conversation, sender, 'same-client-id');
    await expect(makeMessage(conversation, sender, 'same-client-id')).rejects.toThrow();
    await expect(makeMessage(conversation, other, 'same-client-id')).resolves.toBeDefined();
  });

  it('keep message ids strictly increasing', async () => {
    const sender = await makeUser();
    const conversation = await makeGroup(sender);
    const first = await makeMessage(conversation, sender, 'order-1');
    const second = await makeMessage(conversation, sender, 'order-2');
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('require direct conversations to have a direct key and groups to have none', async () => {
    const creator = await makeUser();
    await expect(
      db.insert(conversations).values({ type: 'direct', createdBy: creator.id }),
    ).rejects.toThrow();
    await expect(
      db.insert(conversations).values({ type: 'group', directKey: 'a:b', createdBy: creator.id }),
    ).rejects.toThrow();
  });

  it('allow only one direct conversation per user pair', async () => {
    const creator = await makeUser();
    const values = { type: 'direct', directKey: 'pair:one', createdBy: creator.id };
    await db.insert(conversations).values(values);
    await expect(db.insert(conversations).values(values)).rejects.toThrow();
  });

  it('reject roles and statuses outside the allowed values', async () => {
    const user = await makeUser();
    const conversation = await makeGroup(user);
    await expect(
      testDb.client.execute({
        sql: 'INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
        args: [conversation.id, user.id, 'superuser', Date.now()],
      }),
    ).rejects.toThrow();
    await expect(
      testDb.client.execute({
        sql: "UPDATE users SET status = 'busy' WHERE id = ?",
        args: [user.id],
      }),
    ).rejects.toThrow();
  });

  it('keep one membership row per user per conversation', async () => {
    const user = await makeUser();
    const conversation = await makeGroup(user);
    await db
      .insert(conversationMembers)
      .values({ conversationId: conversation.id, userId: user.id, role: 'owner' });
    await expect(
      db
        .insert(conversationMembers)
        .values({ conversationId: conversation.id, userId: user.id, role: 'member' }),
    ).rejects.toThrow();
  });
});

describe('cascades', () => {
  it('delete messages and memberships with their conversation', async () => {
    const owner = await makeUser();
    const conversation = await makeGroup(owner);
    await db
      .insert(conversationMembers)
      .values({ conversationId: conversation.id, userId: owner.id, role: 'owner' });
    const message = await makeMessage(conversation, owner, 'cascade-1');

    await db.delete(conversations).where(eq(conversations.id, conversation.id));

    expect(await db.select().from(messages).where(eq(messages.id, message.id))).toHaveLength(0);
    expect(
      await db
        .select()
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conversation.id)),
    ).toHaveLength(0);
  });

  it('delete receipts with their message', async () => {
    const owner = await makeUser();
    const reader = await makeUser();
    const conversation = await makeGroup(owner);
    const message = await makeMessage(conversation, owner, 'cascade-2');
    await db.insert(messageReceipts).values({ messageId: message.id, userId: reader.id });

    await db.delete(messages).where(eq(messages.id, message.id));

    expect(
      await db.select().from(messageReceipts).where(eq(messageReceipts.messageId, message.id)),
    ).toHaveLength(0);
  });

  it('detach an attachment from its message instead of deleting the message', async () => {
    const owner = await makeUser();
    const conversation = await makeGroup(owner);
    const [attachment] = await db
      .insert(attachments)
      .values({
        uploaderId: owner.id,
        storageKey: `key-${counter}`,
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      })
      .returning();
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderId: owner.id,
        clientId: 'cascade-3',
        attachmentId: attachment.id,
      })
      .returning();

    await db.delete(attachments).where(eq(attachments.id, attachment.id));

    const [after] = await db.select().from(messages).where(eq(messages.id, message.id));
    expect(after.attachmentId).toBeNull();
  });

  it('delete refresh tokens with their user', async () => {
    const user = await makeUser();
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: `hash-${user.id}`,
      expiresAt: new Date(Date.now() + 1000),
    });

    await db.delete(users).where(eq(users.id, user.id));

    expect(
      await db.select().from(refreshTokens).where(eq(refreshTokens.userId, user.id)),
    ).toHaveLength(0);
  });
});

describe('defaults', () => {
  it('fill ids, timestamps, and status', async () => {
    const user = await makeUser();
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.status).toBe('offline');
    expect(user.lastSeenAt).toBeNull();
  });

  it('use the cursor index for conversation message pages', async () => {
    const plan = await testDb.client.execute(
      "EXPLAIN QUERY PLAN SELECT id FROM messages WHERE conversation_id = 'x' AND (created_at < 1 OR (created_at = 1 AND id < 5)) ORDER BY created_at DESC, id DESC LIMIT 30",
    );
    const detail = plan.rows.map((row) => row.detail).join(' | ');
    expect(detail).toContain('messages_conversation_cursor_idx');
    expect(detail).not.toContain('TEMP B-TREE');
  });
});
