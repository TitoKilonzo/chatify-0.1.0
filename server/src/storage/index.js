import path from 'node:path';
import { createLocalStorage } from './local-storage.js';
import { createR2Client, createR2Storage, r2Endpoint } from './r2-storage.js';

/** Build the configured storage driver. */
export function createStorage(env) {
  if (env.STORAGE_DRIVER === 'r2') {
    return createR2Storage({
      client: createR2Client(env),
      bucket: env.R2_BUCKET,
      signedUrlTtlSeconds: env.SIGNED_URL_TTL_SECONDS,
    });
  }
  return createLocalStorage({ baseDir: path.resolve(env.UPLOAD_DIR) });
}

/** The origin signed URLs point at, which the Content Security Policy must allow. */
export function storageOrigin(env) {
  return env.STORAGE_DRIVER === 'r2' ? new URL(r2Endpoint(env)).origin : null;
}
