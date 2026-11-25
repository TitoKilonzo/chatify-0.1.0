import { describe, expect, it } from 'vitest';
import {
  decryptText,
  deriveConversationKey,
  encryptText,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  isEnvelope,
  lockPrivateKey,
  safetyNumber,
  unlockPrivateKey,
} from '../src/lib/e2ee.js';

async function twoPeople() {
  const alice = await generateKeyPair();
  const bob = await generateKeyPair();
  const aliceKey = await deriveConversationKey(
    alice.privateKey,
    await importPublicKey(await exportPublicKey(bob.publicKey)),
  );
  const bobKey = await deriveConversationKey(
    bob.privateKey,
    await importPublicKey(await exportPublicKey(alice.publicKey)),
  );
  return { alice, bob, aliceKey, bobKey };
}

describe('end-to-end encryption', () => {
  it('exports public keys in the format the server expects', async () => {
    const { publicKey } = await generateKeyPair();
    expect(await exportPublicKey(publicKey)).toMatch(/^[A-Za-z0-9_-]{87}$/);
  });

  it('lets two people read each other and nobody else', async () => {
    const { aliceKey, bobKey } = await twoPeople();
    const sealed = await encryptText(aliceKey, 'meet at noon', 'conv-1');
    expect(isEnvelope(sealed)).toBe(true);
    expect(sealed).not.toContain('noon');
    expect(await decryptText(bobKey, sealed, 'conv-1')).toBe('meet at noon');

    const stranger = await twoPeople();
    await expect(decryptText(stranger.bobKey, sealed, 'conv-1')).rejects.toThrow();
  });

  it('handles unicode and uses a new nonce every time', async () => {
    const { aliceKey, bobKey } = await twoPeople();
    const text = 'Habari za asubuhi - caf\u00e9 \u4f60\u597d';
    const a = await encryptText(aliceKey, text, 'c');
    const b = await encryptText(aliceKey, text, 'c');
    expect(a).not.toBe(b);
    expect(await decryptText(bobKey, a, 'c')).toBe(text);
  });

  it('rejects a message moved to another conversation or altered', async () => {
    const { aliceKey, bobKey } = await twoPeople();
    const sealed = await encryptText(aliceKey, 'private', 'conv-1');
    await expect(decryptText(bobKey, sealed, 'conv-2')).rejects.toThrow();
    const tampered = `${sealed.slice(0, -4)}AAAA`;
    await expect(decryptText(bobKey, tampered, 'conv-1')).rejects.toThrow();
    await expect(decryptText(bobKey, 'e2ee:v1:broken', 'conv-1')).rejects.toThrow();
    await expect(decryptText(bobKey, 'plain text', 'conv-1')).rejects.toThrow();
  });

  it('gives both people the same safety number in either order', async () => {
    const a = await exportPublicKey((await generateKeyPair()).publicKey);
    const b = await exportPublicKey((await generateKeyPair()).publicKey);
    const one = await safetyNumber(a, b);
    expect(one).toMatch(/^(\d{5} ){5}\d{5}$/);
    expect(await safetyNumber(b, a)).toBe(one);
    const c = await exportPublicKey((await generateKeyPair()).publicKey);
    expect(await safetyNumber(a, c)).not.toBe(one);
  });

  it('backs up a private key behind a passphrase', async () => {
    const { alice, bob, aliceKey } = await twoPeople();
    // A low round count keeps the test fast; the real default is much higher.
    const blob = await lockPrivateKey(alice.privateKey, 'correct horse battery', 1000);
    expect(blob).not.toContain('"d"');

    await expect(unlockPrivateKey(blob, 'wrong passphrase')).rejects.toThrow();

    const restored = await unlockPrivateKey(blob, 'correct horse battery');
    expect(await exportPublicKey(restored.publicKey)).toBe(await exportPublicKey(alice.publicKey));
    const bobsView = await deriveConversationKey(
      bob.privateKey,
      await importPublicKey(await exportPublicKey(alice.publicKey)),
    );
    const again = await deriveConversationKey(
      restored.privateKey,
      await importPublicKey(await exportPublicKey(bob.publicKey)),
    );
    const sealed = await encryptText(again, 'after restore', 'c');
    expect(await decryptText(bobsView, sealed, 'c')).toBe('after restore');
    expect(await decryptText(aliceKey, sealed, 'c')).toBe('after restore');
  });
});
