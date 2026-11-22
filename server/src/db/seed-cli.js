/*
 * DEVELOPMENT ONLY. Creates a few clearly labelled sample accounts and conversations so a fresh
 * local database is not empty. It is a separate command (npm run seed) and is never run by the
 * server, the migrations, or the build. It refuses to run in production.
 */
import { env } from '../config/load-env.js';
import { createContainer } from '../container.js';
import { createLogger } from '../utils/logger.js';
import { createDatabase } from './client.js';

const SEED_PASSWORD = 'seed-password-change-me';

const USERS = [
  { displayName: 'Seed Alice', username: 'seed_alice', email: 'seed_alice@example.test' },
  { displayName: 'Seed Bob', username: 'seed_bob', email: 'seed_bob@example.test' },
  { displayName: 'Seed Carol', username: 'seed_carol', email: 'seed_carol@example.test' },
  { displayName: 'Seed Dev', username: 'seed_dev', email: 'seed_dev@example.test' },
];

async function main() {
  if (env.isProduction) {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }
  if (!env.DATABASE_URL.startsWith('file:')) {
    throw new Error('Refusing to seed: DATABASE_URL is not a local file database.');
  }

  const logger = createLogger(env);
  const database = await createDatabase(env);
  const container = createContainer({ env, logger, database });
  const { authService, conversationsService, messagesService, usersRepository } = container;

  const users = [];
  for (const spec of USERS) {
    const existing = await usersRepository.findByIdentifier(spec.username);
    if (existing) {
      users.push(existing);
      continue;
    }
    const session = await authService.register({ ...spec, password: SEED_PASSWORD });
    users.push(session.user);
  }
  const [alice, bob, carol, dev] = users;

  const direct = await conversationsService.openDirect(alice.id, bob.id);
  const group = await conversationsService.createGroup(alice.id, {
    name: 'Seed project team',
    memberIds: [bob.id, carol.id, dev.id],
  });

  const script = [
    [alice, direct.conversation.id, 'Hi Bob, this is a seeded sample conversation.'],
    [bob, direct.conversation.id, 'Hi Alice. Messages here exist only for local development.'],
    [alice, group.id, 'Welcome to the seeded group.'],
    [
      carol,
      group.id,
      'Thanks. Sign in as any seed user with the password printed by the seed command.',
    ],
    [dev, group.id, 'Delete this database file to start again from nothing.'],
  ];
  let sent = 0;
  for (const [sender, conversationId, body] of script) {
    await messagesService.send(sender.id, conversationId, {
      clientId: `seed-${conversationId.slice(0, 8)}-${sent}`,
      body,
    });
    sent += 1;
  }

  console.log(
    `Seeded ${users.length} users, 1 direct chat and 1 group.\n` +
      `Usernames: ${USERS.map((u) => u.username).join(', ')}\n` +
      `Password for all of them: ${SEED_PASSWORD}`,
  );
  database.client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
