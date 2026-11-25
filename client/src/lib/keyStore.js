/*
 * Where this device keeps its encryption key pair: IndexedDB, one record per user. The key
 * objects are stored as they are (structured clone), so nothing is converted to text. When
 * IndexedDB is unavailable (some private modes) keys live in memory for the visit only, and the
 * person can restore them from their passphrase backup next time.
 */

const DB_NAME = 'chatify-keys';
const STORE = 'pairs';
const memory = new Map();

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadKeyPair(userId) {
  try {
    return (await run('readonly', (store) => store.get(userId))) ?? memory.get(userId) ?? null;
  } catch {
    return memory.get(userId) ?? null;
  }
}

export async function saveKeyPair(userId, pair) {
  memory.set(userId, pair);
  try {
    await run('readwrite', (store) => store.put(pair, userId));
  } catch {
    // Kept in memory for this visit.
  }
}

export async function deleteKeyPair(userId) {
  memory.delete(userId);
  try {
    await run('readwrite', (store) => store.delete(userId));
  } catch {
    // Nothing stored.
  }
}
