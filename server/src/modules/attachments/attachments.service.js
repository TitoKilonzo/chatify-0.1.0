import { forbidden, notFound, tooManyRequests, unsupportedMedia } from '../../utils/errors.js';
import { newStorageKey } from '../../storage/local-storage.js';
import { detectMime, IMAGE_MIME, sanitizeFileName } from './file-validation.js';
import { processAvatar, processImage } from './image-processing.js';
import { toAttachment } from './attachments.serializer.js';

const UPLOADS_PER_HOUR = 60;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const ORPHAN_BATCH = 100;
const AVATAR_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function createAttachmentsService({
  attachmentsRepository,
  conversationsRepository,
  usersRepository,
  storage,
  logger,
  now = () => new Date(),
}) {
  async function removeStored(...keys) {
    for (const key of keys.filter(Boolean)) {
      try {
        await storage.delete(key);
      } catch (err) {
        logger.warn({ err, key }, 'failed to delete stored file');
      }
    }
  }

  const service = {
    /** Validate by content, store the file and thumbnail, and record the attachment. */
    async upload(userId, file) {
      if (!file) {
        throw unsupportedMedia('No file was uploaded');
      }
      const since = new Date(now().getTime() - 60 * 60 * 1000);
      if ((await attachmentsRepository.countForUploader(userId, since)) >= UPLOADS_PER_HOUR) {
        throw tooManyRequests('UPLOAD_LIMIT', 'Too many uploads, please try again later');
      }

      const originalName = sanitizeFileName(file.originalname);
      const { mimeType } = await detectMime(file.buffer, originalName);

      let width = null;
      let height = null;
      let thumbnail = null;
      if (IMAGE_MIME.has(mimeType)) {
        ({ width, height, thumbnail } = await processImage(file.buffer));
      }

      const { key, thumbnailKey } = newStorageKey();
      await storage.put(key, file.buffer, { contentType: mimeType });
      if (thumbnail) {
        await storage.put(thumbnailKey, thumbnail, { contentType: 'image/webp' });
      }
      try {
        const row = await attachmentsRepository.create({
          uploaderId: userId,
          storageKey: key,
          thumbnailKey: thumbnail ? thumbnailKey : null,
          originalName,
          mimeType,
          sizeBytes: file.buffer.length,
          width,
          height,
        });
        return toAttachment(row);
      } catch (err) {
        await removeStored(key, thumbnail ? thumbnailKey : null);
        throw err;
      }
    },

    /**
     * Open an attachment for download. Only members of the conversation that carries it may read
     * it; everyone else gets 404, as does an attachment no message references.
     */
    async open(userId, attachmentId, { thumbnail = false } = {}) {
      const found = await attachmentsRepository.findWithConversation(attachmentId);
      if (!found) {
        throw notFound('File not found');
      }
      const member = await conversationsRepository.findMember(found.conversationId, userId);
      if (!member) {
        throw notFound('File not found');
      }
      const { attachment } = found;
      const key = thumbnail ? attachment.thumbnailKey : attachment.storageKey;
      if (!key) {
        throw notFound('File not found');
      }
      const meta = {
        name: attachment.originalName,
        mimeType: thumbnail ? 'image/webp' : attachment.mimeType,
        inline: thumbnail || IMAGE_MIME.has(attachment.mimeType),
      };
      // Cloud storage: membership was checked above, so hand out a short-lived signed URL and let
      // the browser fetch the bytes directly.
      const url = await storage.signedUrl(key, {
        filename: meta.name,
        contentType: meta.mimeType,
        inline: meta.inline,
      });
      if (url) {
        return { ...meta, url, redirectCacheSeconds: storage.redirectCacheSeconds };
      }
      const stored = await storage.get(key);
      if (!stored) {
        throw notFound('File not found');
      }
      return { ...stored, ...meta };
    },

    /** Delete an attachment row and its files. Idempotent. */
    async discard(attachmentId) {
      const row = await attachmentsRepository.findById(attachmentId);
      if (!row) {
        return;
      }
      await attachmentsRepository.delete(attachmentId);
      await removeStored(row.storageKey, row.thumbnailKey);
    },

    /** Remove uploads that were never sent. Run on a timer; returns how many were removed. */
    async cleanupOrphans() {
      const cutoff = new Date(now().getTime() - ORPHAN_AGE_MS);
      let removed = 0;
      for (;;) {
        const orphans = await attachmentsRepository.listOrphans(cutoff, ORPHAN_BATCH);
        if (orphans.length === 0) {
          return removed;
        }
        for (const orphan of orphans) {
          await attachmentsRepository.delete(orphan.id);
          await removeStored(orphan.storageKey, orphan.thumbnailKey);
          removed += 1;
        }
        if (orphans.length < ORPHAN_BATCH) {
          return removed;
        }
      }
    },

    // Avatars -------------------------------------------------------------------------------

    async storeAvatar(file) {
      if (!file) {
        throw unsupportedMedia('No file was uploaded');
      }
      const { mimeType } = await detectMime(file.buffer, file.originalname ?? '');
      if (!AVATAR_MIME.has(mimeType)) {
        throw unsupportedMedia('Avatars must be PNG, JPEG, WebP or GIF images');
      }
      const processed = await processAvatar(file.buffer);
      const { key } = newStorageKey();
      await storage.put(key, processed, { contentType: 'image/webp' });
      return key;
    },

    async setUserAvatar(userId, file) {
      const key = await service.storeAvatar(file);
      const before = await usersRepository.findById(userId);
      const user = await usersRepository.update(userId, { avatarPath: key });
      await removeStored(before?.avatarPath);
      return user;
    },

    async clearUserAvatar(userId) {
      const before = await usersRepository.findById(userId);
      const user = await usersRepository.update(userId, { avatarPath: null });
      await removeStored(before?.avatarPath);
      return user;
    },

    /** Any signed-in user may view any user's avatar: avatars are part of the public profile. */
    async openUserAvatar(userId) {
      const user = await usersRepository.findById(userId);
      return openAvatar(user?.avatarPath);
    },

    async setGroupAvatar(userId, conversationId, file) {
      await requireGroupAdmin(conversationId, userId);
      const key = await service.storeAvatar(file);
      const before = await conversationsRepository.findById(conversationId);
      await conversationsRepository.updateConversation(conversationId, { avatarPath: key });
      await removeStored(before?.avatarPath);
    },

    async clearGroupAvatar(userId, conversationId) {
      await requireGroupAdmin(conversationId, userId);
      const before = await conversationsRepository.findById(conversationId);
      await conversationsRepository.updateConversation(conversationId, { avatarPath: null });
      await removeStored(before?.avatarPath);
    },

    async openGroupAvatar(userId, conversationId) {
      const member = await conversationsRepository.findMember(conversationId, userId);
      if (!member) {
        throw notFound('Conversation not found');
      }
      const conversation = await conversationsRepository.findById(conversationId);
      return openAvatar(conversation?.avatarPath);
    },
  };

  async function requireGroupAdmin(conversationId, userId) {
    const member = await conversationsRepository.findMember(conversationId, userId);
    if (!member) {
      throw notFound('Conversation not found');
    }
    const conversation = await conversationsRepository.findById(conversationId);
    if (conversation.type !== 'group') {
      throw notFound('Conversation not found');
    }
    if (member.role === 'member') {
      throw forbidden('NOT_GROUP_ADMIN', 'Only group admins can do that');
    }
  }

  async function openAvatar(key) {
    if (!key) {
      throw notFound('No avatar');
    }
    const url = await storage.signedUrl(key, { contentType: 'image/webp', inline: true });
    if (url) {
      return { mimeType: 'image/webp', url, redirectCacheSeconds: storage.redirectCacheSeconds };
    }
    const stored = await storage.get(key);
    if (!stored) {
      throw notFound('No avatar');
    }
    return { ...stored, mimeType: 'image/webp' };
  }

  return service;
}
