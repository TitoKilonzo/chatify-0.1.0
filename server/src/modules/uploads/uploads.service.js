import { createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  AppError,
  conflict,
  notFound,
  payloadTooLarge,
  tooManyRequests,
  unsupportedMedia,
} from '../../utils/errors.js';
import { newStorageKey } from '../../storage/keys.js';
import { IMAGE_MIME, detectMime, sanitizeFileName } from '../attachments/file-validation.js';
import { toAttachment } from '../attachments/attachments.serializer.js';

export const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_ACTIVE_SESSIONS = 3;
const UPLOADS_PER_HOUR = 60;
const STALE_AGE_MS = 24 * 60 * 60 * 1000;
const HEAD_BYTES = 64 * 1024;

/**
 * Resumable uploads for files larger than a single request should carry. The client creates a
 * session, sends chunks at the offset the server expects, and asks to complete. After a dropped
 * connection it asks for the offset and continues; nothing is resent. Chunks are written to a
 * temporary file, the finished file is validated by its content like any other upload, and only
 * then moved into storage.
 */
export function createUploadsService({
  uploadsRepository,
  attachmentsRepository,
  storage,
  logger,
  maxBytes,
  tempDir,
  now = () => new Date(),
}) {
  const partialPath = (id) => path.join(tempDir, `${id}.part`);

  async function load(userId, id) {
    const session = await uploadsRepository.findForUser(id, userId);
    if (!session) {
      throw notFound('Upload not found');
    }
    // A redeploy can wipe the temporary directory; then the upload restarts from zero.
    let onDisk = 0;
    try {
      onDisk = (await stat(partialPath(id))).size;
    } catch {
      await writeFile(partialPath(id), '');
    }
    if (onDisk !== session.offsetBytes) {
      await truncate(partialPath(id), Math.min(onDisk, session.offsetBytes));
      const real = (await stat(partialPath(id))).size;
      await uploadsRepository.setOffset(id, real, now());
      return { ...session, offsetBytes: real };
    }
    return session;
  }

  const view = (session) => ({
    id: session.id,
    size: session.sizeBytes,
    offset: session.offsetBytes,
    chunkBytes: CHUNK_BYTES,
  });

  return {
    limits: { maxBytes, chunkBytes: CHUNK_BYTES },

    async create(userId, { name, size }) {
      if (size > maxBytes) {
        throw payloadTooLarge(`Files can be at most ${Math.floor(maxBytes / 1024 / 1024)} MB`);
      }
      if ((await uploadsRepository.countForUser(userId)) >= MAX_ACTIVE_SESSIONS) {
        throw tooManyRequests('UPLOAD_LIMIT', 'Finish or cancel your other uploads first');
      }
      const row = await uploadsRepository.create({
        userId,
        name: sanitizeFileName(name),
        sizeBytes: size,
        offsetBytes: 0,
        updatedAt: now(),
      });
      await mkdir(tempDir, { recursive: true });
      await writeFile(partialPath(row.id), '');
      return view(row);
    },

    async status(userId, id) {
      return view(await load(userId, id));
    },

    /** Append one chunk. The stream must start exactly where the server expects. */
    async append(userId, id, offset, stream) {
      const session = await load(userId, id);
      if (offset !== session.offsetBytes) {
        throw conflict('OFFSET_MISMATCH', 'The upload is at a different position', {
          offset: session.offsetBytes,
        });
      }
      const room = Math.min(CHUNK_BYTES, session.sizeBytes - session.offsetBytes);
      if (room <= 0) {
        throw conflict('UPLOAD_FULL', 'All bytes were already received');
      }
      let received = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(
            received > room ? payloadTooLarge('That chunk is larger than expected') : null,
            chunk,
          );
        },
      });
      try {
        await pipeline(stream, limiter, createWriteStream(partialPath(id), { flags: 'a' }));
      } catch (err) {
        // Drop a partial chunk so the next attempt starts from the last good offset.
        await truncate(partialPath(id), session.offsetBytes).catch(() => {});
        throw err instanceof AppError
          ? err
          : conflict('CHUNK_INTERRUPTED', 'The chunk did not arrive');
      }
      const next = session.offsetBytes + received;
      await uploadsRepository.setOffset(id, next, now());
      return view({ ...session, offsetBytes: next });
    },

    /** Validate the finished file, move it into storage and record the attachment. */
    async complete(userId, id) {
      const session = await load(userId, id);
      if (session.offsetBytes !== session.sizeBytes) {
        throw conflict('UPLOAD_INCOMPLETE', 'Not all bytes have arrived yet', {
          offset: session.offsetBytes,
        });
      }
      const since = new Date(now().getTime() - 60 * 60 * 1000);
      if ((await attachmentsRepository.countForUploader(userId, since)) >= UPLOADS_PER_HOUR) {
        throw tooManyRequests('UPLOAD_LIMIT', 'Too many uploads, please try again later');
      }

      const file = partialPath(id);
      const handle = await open(file, 'r');
      let head;
      try {
        head = Buffer.alloc(Math.min(HEAD_BYTES, session.sizeBytes));
        await handle.read(head, 0, head.length, 0);
      } finally {
        await handle.close();
      }
      let mimeType;
      try {
        ({ mimeType } = await detectMime(head, session.name));
      } catch (err) {
        await this.cancel(userId, id);
        throw err;
      }
      if (IMAGE_MIME.has(mimeType)) {
        await this.cancel(userId, id);
        throw unsupportedMedia('Images are sent with the regular upload');
      }

      const { key } = newStorageKey();
      await storage.putFile(key, file, { contentType: mimeType });
      try {
        const row = await attachmentsRepository.create({
          uploaderId: userId,
          storageKey: key,
          thumbnailKey: null,
          originalName: session.name,
          mimeType,
          sizeBytes: session.sizeBytes,
          width: null,
          height: null,
        });
        await this.cancel(userId, id);
        return toAttachment(row);
      } catch (err) {
        await storage.delete(key).catch(() => {});
        throw err;
      }
    },

    async cancel(userId, id) {
      const session = await uploadsRepository.findForUser(id, userId);
      if (!session) {
        return;
      }
      await rm(partialPath(id), { force: true });
      await uploadsRepository.delete(id);
    },

    /** Remove sessions nobody touched for a day, with their temporary files. */
    async cleanupStale() {
      const stale = await uploadsRepository.listStale(
        new Date(now().getTime() - STALE_AGE_MS),
        100,
      );
      for (const session of stale) {
        await rm(partialPath(session.id), { force: true });
        await uploadsRepository.delete(session.id);
      }
      if (stale.length > 0) {
        logger.info({ removed: stale.length }, 'removed stale upload sessions');
      }
      return stale.length;
    },
  };
}
