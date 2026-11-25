/*
 * End-to-end encryption primitives, built only on the browser's WebCrypto API.
 *
 * Each person has one P-256 key pair. Two people derive the same secret from their own private
 * key and the other's public key (ECDH), stretch it with HKDF into an AES-256-GCM key, and
 * encrypt every message with a fresh random nonce. The conversation id is bound to each message as
 * authenticated data, so a ciphertext cannot be replayed into another conversation. The server
 * only ever sees "e2ee:v1:<nonce>.<ciphertext>".
 *
 * The private key can be backed up: it is locked with a passphrase (PBKDF2, 310000 rounds, then
 * AES-GCM) before it leaves the device, so the server stores a blob it cannot open.
 */

export const ENVELOPE_PREFIX = 'e2ee:v1:';
const PBKDF2_ROUNDS = 310_000;
const HKDF_INFO = 'chatify-e2ee-v1';
const CURVE = { name: 'ECDH', namedCurve: 'P-256' };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function isEnvelope(body) {
  return typeof body === 'string' && body.startsWith(ENVELOPE_PREFIX);
}

export async function generateKeyPair() {
  // Extractable so the private key can be stored locally and backed up; it never leaves the
  // device unlocked.
  return crypto.subtle.generateKey(CURVE, true, ['deriveBits']);
}

/** The public key as 87 base64url characters (the 65 byte uncompressed point). */
export async function exportPublicKey(publicKey) {
  return toBase64Url(await crypto.subtle.exportKey('raw', publicKey));
}

export function importPublicKey(encoded) {
  return crypto.subtle.importKey('raw', fromBase64Url(encoded), CURVE, true, []);
}

/** The shared AES key for a conversation between my private key and their public key. */
export async function deriveConversationKey(privateKey, peerPublicKey) {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode(HKDF_INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(key, text, conversationId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(conversationId) },
    key,
    encoder.encode(text),
  );
  return `${ENVELOPE_PREFIX}${toBase64Url(iv)}.${toBase64Url(data)}`;
}

/** Throws when the message was changed, came from another conversation, or the key is wrong. */
export async function decryptText(key, envelope, conversationId) {
  if (!isEnvelope(envelope)) {
    throw new Error('Not an encrypted message');
  }
  const [iv, data] = envelope.slice(ENVELOPE_PREFIX.length).split('.');
  if (!iv || !data) {
    throw new Error('Malformed encrypted message');
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(iv), additionalData: encoder.encode(conversationId) },
    key,
    fromBase64Url(data),
  );
  return decoder.decode(plain);
}

/**
 * A number both people can read out loud to confirm they hold each other's real keys. It is the
 * same for both, whatever order the keys are given in. Shown as 6 groups of 5 digits.
 */
export async function safetyNumber(publicKeyA, publicKeyB) {
  const [first, second] = [publicKeyA, publicKeyB].sort();
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(`${first}|${second}`)),
  );
  const groups = [];
  for (let index = 0; index < 6; index += 1) {
    const value =
      ((digest[index * 3] << 16) | (digest[index * 3 + 1] << 8) | digest[index * 3 + 2]) % 100000;
    groups.push(String(value).padStart(5, '0'));
  }
  return groups.join(' ');
}

async function passphraseKey(passphrase, salt, rounds) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Lock a private key with a passphrase. The result is a JSON string safe to store anywhere. */
export async function lockPrivateKey(privateKey, passphrase, rounds = PBKDF2_ROUNDS) {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passphraseKey(passphrase, salt, rounds);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(jwk)),
  );
  return JSON.stringify({
    v: 1,
    rounds,
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    data: toBase64Url(data),
  });
}

/** Open a locked private key. Throws when the passphrase is wrong. */
export async function unlockPrivateKey(blob, passphrase) {
  const parsed = JSON.parse(blob);
  if (parsed.v !== 1) {
    throw new Error('Unknown backup format');
  }
  const key = await passphraseKey(passphrase, fromBase64Url(parsed.salt), parsed.rounds);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(parsed.iv) },
    key,
    fromBase64Url(parsed.data),
  );
  const jwk = JSON.parse(decoder.decode(plain));
  const privateKey = await crypto.subtle.importKey('jwk', jwk, CURVE, true, ['deriveBits']);
  // The public half travels in the same JWK, which lets the caller check it matches the server.
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
    CURVE,
    true,
    [],
  );
  return { privateKey, publicKey };
}
