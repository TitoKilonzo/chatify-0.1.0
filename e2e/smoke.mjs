/*
 * Two-browser realtime smoke test. Requires a running Chatify server that serves the built
 * client (see README, "End-to-end smoke test") and Playwright with Chromium installed.
 *
 *   BASE_URL=http://localhost:4000 node e2e/smoke.mjs
 *
 * It registers two users in separate browser contexts and checks: realtime delivery, typing,
 * unread badges, read receipts, reconnect without loss or duplicates, and file sharing.
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
const SHOTS = process.env.SHOTS_DIR ?? '';
const suffix = Date.now().toString(36);
const PASSWORD = 'correct horse battery staple';

let failures = 0;
function check(name, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) {
    failures += 1;
  }
}

async function register(page, label) {
  await page.goto(`${BASE_URL}/register`);
  await page.getByLabel('Display name').fill(`${label} ${suffix}`);
  await page.getByLabel('Username').fill(`${label}_${suffix}`.toLowerCase());
  await page.getByLabel('Email').fill(`${label}_${suffix}@example.com`.toLowerCase());
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/chats');
}

async function shot(page, name) {
  if (SHOTS) {
    await mkdir(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
}

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const a = await ctxA.newPage();
const b = await ctxB.newPage();
a.on('pageerror', (err) => check(`no page error in A (${err.message})`, false));
b.on('pageerror', (err) => check(`no page error in B (${err.message})`, false));

try {
  await register(a, 'Alice');
  await register(b, 'Bob');
  check('both users registered and landed on /chats', true);

  // Alice starts a conversation with Bob.
  await a.getByRole('button', { name: 'Start a conversation' }).click();
  await a.getByRole('menuitem', { name: 'New message' }).click();
  await a.getByLabel('Search people').fill(`bob_${suffix}`.toLowerCase());
  await a.getByRole('button', { name: new RegExp(`Bob ${suffix}`, 'i') }).click();
  await a.waitForURL(/\/chats\/[0-9a-f-]{36}/);
  check('direct conversation opened', true);

  // Realtime delivery.
  await a.getByLabel('Message', { exact: true }).fill('hello bob');
  await a.getByRole('button', { name: 'Send message' }).click();
  await b
    .getByRole('link', { name: new RegExp(`Alice ${suffix}`, 'i') })
    .waitFor({ timeout: 5000 });
  check('Bob sees the new conversation without reloading', true);

  const badge = b.getByRole('link', { name: new RegExp(`Alice ${suffix}.*1 unread`, 'i') });
  await badge.waitFor({ timeout: 5000 });
  check('Bob sees an unread badge of 1', true);
  await shot(b, '01-unread-badge');

  // Opening the conversation clears the badge and gives Alice a read receipt.
  await b.getByRole('link', { name: new RegExp(`Alice ${suffix}`, 'i') }).click();
  await b.getByRole('log').getByText('hello bob').waitFor();
  await b
    .getByRole('link', { name: /Alice.*unread/i })
    .waitFor({ state: 'detached', timeout: 5000 });
  check('unread badge clears when Bob opens the chat', true);
  await a.getByText('Read', { exact: true }).first().waitFor({ timeout: 5000 });
  check('Alice sees the Read receipt', true);

  // Typing indicator.
  await b.getByLabel('Message', { exact: true }).pressSequentially('typing now', { delay: 30 });
  await a.getByText('typing...').first().waitFor({ timeout: 5000 });
  check('Alice sees the typing indicator', true);
  await b.getByLabel('Message', { exact: true }).fill('');

  // Reconnect without loss or duplicates: take Bob offline, Alice sends, Bob comes back.
  await ctxB.setOffline(true);
  await a.getByLabel('Message', { exact: true }).fill('while you were away 1');
  await a.getByRole('button', { name: 'Send message' }).click();
  await a.getByLabel('Message', { exact: true }).fill('while you were away 2');
  await a.getByRole('button', { name: 'Send message' }).click();
  await a.getByRole('log').getByText('while you were away 2').waitFor();
  await ctxB.setOffline(false);
  await b.getByRole('log').getByText('while you were away 2').waitFor({ timeout: 20000 });
  const count1 = await b
    .getByRole('log')
    .getByText('while you were away 1', { exact: true })
    .count();
  const count2 = await b
    .getByRole('log')
    .getByText('while you were away 2', { exact: true })
    .count();
  check('Bob received missed messages after reconnecting', true);
  check('no duplicates after reconnect', count1 === 1 && count2 === 1);

  // File sharing.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await a.locator('input[type=file]').first().setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await a.getByText('ready to send').waitFor({ timeout: 10000 });
  await a.getByRole('button', { name: 'Send message' }).click();
  await b.getByRole('button', { name: 'Open image pixel.png' }).waitFor({ timeout: 10000 });
  check('Bob sees the shared image', true);
  const loaded = await b
    .getByRole('img', { name: 'pixel.png' })
    .evaluate((img) => img.complete && img.naturalWidth > 0);
  check('the image actually loads for Bob (authenticated download)', loaded);
  await shot(a, '02-alice');
  await shot(b, '03-bob');

  // Mobile layout: list and pane are separate screens with a back button.
  const phone = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const m = await phone.newPage();
  await m.goto(`${BASE_URL}/login`);
  await m.getByLabel(/email or username/i).fill(`bob_${suffix}`.toLowerCase());
  await m.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await m.getByRole('button', { name: /log in|sign in/i }).click();
  await m.waitForURL('**/chats');
  await m.getByRole('link', { name: new RegExp(`Alice ${suffix}`, 'i') }).click();
  await m.getByRole('button', { name: 'Back to conversations' }).waitFor();
  const listHidden = await m.getByRole('navigation', { name: 'Conversations' }).isHidden();
  check('mobile: opening a chat hides the list and shows a back button', listHidden);
  await shot(m, '04-mobile-pane');
  await m.getByRole('button', { name: 'Back to conversations' }).click();
  await m.getByRole('navigation', { name: 'Conversations' }).waitFor();
  check('mobile: back returns to the list', true);
  await shot(m, '05-mobile-list');
  await phone.close();
} catch (error) {
  check(`script completed (${error.message.split('\n')[0]})`, false);
  await shot(a, 'failure-a');
  await shot(b, 'failure-b');
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
