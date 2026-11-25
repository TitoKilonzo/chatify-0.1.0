import { ApiError, api } from './api.js';

/*
 * Resumable upload for large files. The file is sent in chunks at the offset the server expects.
 * After a dropped connection the client asks where the server got to and continues from there,
 * so only the unsent part travels again. A pending upload is remembered in localStorage by the
 * file's name, size and modified time, so choosing the same file again after a reload or a closed
 * tab continues instead of starting over.
 */

const STORAGE_KEY = 'chatify:resumable-uploads';
const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 800;
const MAX_DELAY_MS = 15_000;

const fingerprint = (file) => `${file.name}|${file.size}|${file.lastModified}`;

function readPending(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function writePending(map, storage = globalThis.localStorage) {
  try {
    if (Object.keys(map).length === 0) {
      storage?.removeItem(STORAGE_KEY);
    } else {
      storage?.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Without storage the upload still works; it just cannot be resumed after a reload.
  }
}

export function rememberUpload(file, uploadId, storage) {
  writePending({ ...readPending(storage), [fingerprint(file)]: uploadId }, storage);
}

export function forgetUpload(file, storage) {
  const map = readPending(storage);
  delete map[fingerprint(file)];
  writePending(map, storage);
}

export function rememberedUploadId(file, storage) {
  return readPending(storage)[fingerprint(file)] ?? null;
}

/** Delay before retry number attempt (0-based): exponential, capped. */
export function backoffDelay(attempt) {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new ApiError({ status: 0, code: 'ABORTED', message: 'Upload cancelled' }));
      },
      { once: true },
    );
  });
}

function isRetryable(error) {
  return (
    error instanceof ApiError &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500) &&
    error.code !== 'ABORTED'
  );
}

/** Find a session the server still knows for this file, or create a new one. */
async function openSession(file) {
  const remembered = rememberedUploadId(file);
  if (remembered) {
    try {
      const { upload } = await api.get(`/uploads/${remembered}`);
      if (upload.size === file.size) {
        return upload;
      }
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }
    forgetUpload(file);
  }
  const { upload } = await api.post('/uploads', { name: file.name, size: file.size });
  rememberUpload(file, upload.id);
  return upload;
}

/**
 * Upload file in chunks and return the finished attachment. onProgress receives 0..1. Throws an
 * ApiError with code ABORTED when the signal fires; the session is kept so it can be resumed.
 */
export async function uploadResumable(file, { signal, onProgress } = {}) {
  let session = await openSession(file);
  let failures = 0;

  while (session.offset < session.size) {
    const start = session.offset;
    const end = Math.min(start + session.chunkBytes, session.size);
    try {
      const data = await api.uploadChunk(`/uploads/${session.id}`, file.slice(start, end), {
        offset: start,
        signal,
        onProgress: (loaded) => onProgress?.((start + loaded) / session.size),
      });
      session = data.upload;
      failures = 0;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The server is at another position (for example a chunk landed but its reply was lost).
        session = (await api.get(`/uploads/${session.id}`)).upload;
        continue;
      }
      if (!isRetryable(error) || failures >= MAX_ATTEMPTS) {
        throw error;
      }
      await wait(backoffDelay(failures), signal);
      failures += 1;
      try {
        session = (await api.get(`/uploads/${session.id}`)).upload;
      } catch {
        // Still offline: the next loop iteration tries the chunk again after another delay.
      }
    }
  }

  const { attachment } = await api.post(`/uploads/${session.id}/complete`);
  forgetUpload(file);
  return attachment;
}

/** Throw away the server-side session for a file the user gave up on. */
export async function cancelResumable(file) {
  const id = rememberedUploadId(file);
  forgetUpload(file);
  if (id) {
    await api.delete(`/uploads/${id}`).catch(() => {});
  }
}
