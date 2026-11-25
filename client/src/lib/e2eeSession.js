import { create } from 'zustand';
import { api } from './api.js';
import {
  decryptText,
  deriveConversationKey,
  encryptText,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
  lockPrivateKey,
  unlockPrivateKey,
} from './e2ee.js';
import { deleteKeyPair, loadKeyPair, saveKeyPair } from './keyStore.js';

/*
 * Ties the crypto primitives to this device and the server: creating and publishing a key,
 * backing it up, restoring it, and deriving the key for a conversation. Decrypted text of
 * messages is kept only in memory (plainCache), never written to storage.
 */

const plainCache = new Map(); // clientId -> text
const conversationKeys = new Map(); // `${userId}:${peerId}:${theirKey}` -> CryptoKey

export const rememberPlain = (clientId, text) => plainCache.set(clientId, text);
export const recallPlain = (clientId) => plainCache.get(clientId);

/** What the Settings and conversation screens need to know about this person's key. */
export const useKeyStatus = create((set) => ({
  loaded: false,
  // 'none' | 'ready' (here and published) | 'mismatch' (this device's key is not the published one)
  state: 'none',
  hasBackup: false,
  publicKey: null,
  set: (values) => set({ loaded: true, ...values }),
  reset: () => set({ loaded: false, state: 'none', hasBackup: false, publicKey: null }),
}));

export async function refreshKeyStatus(userId) {
  const [local, remote] = await Promise.all([
    loadKeyPair(userId),
    api.get('/keys/me').catch(() => ({ publicKey: null, hasBackup: false })),
  ]);
  const localPublic = local ? await exportPublicKey(local.publicKey) : null;
  let state = 'none';
  if (localPublic && remote.publicKey === localPublic) {
    state = 'ready';
  } else if (localPublic || remote.publicKey) {
    // Either this device has no key but the account has one, or the two differ.
    state = 'mismatch';
  }
  useKeyStatus.getState().set({
    state,
    hasBackup: remote.hasBackup,
    publicKey: remote.publicKey,
  });
  return state;
}

/** Make a new key pair on this device and publish its public half. Replaces any earlier key. */
export async function createKey(userId) {
  const pair = await generateKeyPair();
  await saveKeyPair(userId, pair);
  conversationKeys.clear();
  await api.put('/keys/me', { publicKey: await exportPublicKey(pair.publicKey) });
  return refreshKeyStatus(userId);
}

export async function backUpKey(userId, passphrase) {
  const pair = await loadKeyPair(userId);
  if (!pair) {
    throw new Error('This device has no key to back up.');
  }
  await api.put('/keys/me/backup', { backup: await lockPrivateKey(pair.privateKey, passphrase) });
  return refreshKeyStatus(userId);
}

export async function removeBackup(userId) {
  await api.delete('/keys/me/backup');
  return refreshKeyStatus(userId);
}

/** Bring the account's key to this device using the passphrase set when it was backed up. */
export async function restoreKey(userId, passphrase) {
  let data;
  try {
    data = await api.get('/keys/me/backup');
  } catch {
    throw new Error('There is no backup to restore. Create a new key instead.');
  }
  let opened;
  try {
    opened = await unlockPrivateKey(data.backup, passphrase);
  } catch {
    throw new Error('That passphrase is not right.');
  }
  if ((await exportPublicKey(opened.publicKey)) !== data.publicKey) {
    throw new Error('The backup does not match your published key.');
  }
  await saveKeyPair(userId, { privateKey: opened.privateKey, publicKey: opened.publicKey });
  conversationKeys.clear();
  return refreshKeyStatus(userId);
}

export async function forgetLocalKey(userId) {
  await deleteKeyPair(userId);
  conversationKeys.clear();
  plainCache.clear();
  useKeyStatus.getState().reset();
}

/**
 * Everything needed to encrypt for one conversation: the shared key plus both public keys (for the
 * safety number). Returns a reason string instead when encryption cannot work right now.
 */
export async function openConversation(userId, peerId, conversationId) {
  const pair = await loadKeyPair(userId);
  if (!pair) {
    return { ok: false, reason: 'no-local-key' };
  }
  const mine = await exportPublicKey(pair.publicKey);
  let theirs;
  try {
    theirs = (await api.get(`/keys/${peerId}`)).publicKey;
  } catch {
    return { ok: false, reason: 'peer-no-key' };
  }
  const cacheKey = `${userId}:${peerId}:${mine}:${theirs}`;
  let key = conversationKeys.get(cacheKey);
  if (!key) {
    key = await deriveConversationKey(pair.privateKey, await importPublicKey(theirs));
    conversationKeys.set(cacheKey, key);
  }
  return {
    ok: true,
    mine,
    theirs,
    encrypt: (text) => encryptText(key, text, conversationId),
    decrypt: (envelope) => decryptText(key, envelope, conversationId),
  };
}
