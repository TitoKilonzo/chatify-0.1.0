import { generateVAPIDKeys } from 'web-push';

// Prints a fresh VAPID key pair for Web Push. Put the values in the server environment.
const keys = generateVAPIDKeys();
process.stdout.write(
  [
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    'VAPID_SUBJECT=mailto:you@example.com',
    '',
  ].join('\n'),
);
