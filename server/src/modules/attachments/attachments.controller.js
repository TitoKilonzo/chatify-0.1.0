import { pipeline } from 'node:stream/promises';
import { toSelfUser } from '../users/users.serializer.js';

const FILE_CSP = "default-src 'none'; sandbox";

/** Stream a stored file with headers that make browsers treat it as inert data. */
async function sendFile(res, file, { cacheSeconds }) {
  res.set({
    'Content-Length': String(file.size),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': FILE_CSP,
    'Cross-Origin-Resource-Policy': 'same-site',
    'Cache-Control': `private, max-age=${cacheSeconds}`,
  });
  if (file.inline) {
    res.set('Content-Disposition', 'inline');
  } else {
    // res.attachment encodes the file name safely for the header.
    res.attachment(file.name);
  }
  res.type(file.mimeType);
  try {
    await pipeline(file.stream, res);
  } catch {
    // The client went away or the file vanished mid-stream. Nothing useful remains to send.
    res.destroy();
  }
}

export function createAttachmentsController({ attachmentsService }) {
  return {
    async upload(req, res) {
      const attachment = await attachmentsService.upload(req.auth.userId, req.file);
      res.status(201).json({ attachment });
    },

    async download(req, res) {
      const file = await attachmentsService.open(
        req.auth.userId,
        req.validated.params.attachmentId,
      );
      await sendFile(res, file, { cacheSeconds: 3600 });
    },

    async thumbnail(req, res) {
      const file = await attachmentsService.open(
        req.auth.userId,
        req.validated.params.attachmentId,
        {
          thumbnail: true,
        },
      );
      await sendFile(res, { ...file, inline: true }, { cacheSeconds: 3600 });
    },

    async setMyAvatar(req, res) {
      const user = await attachmentsService.setUserAvatar(req.auth.userId, req.file);
      res.json({ user: toSelfUser(user) });
    },

    async clearMyAvatar(req, res) {
      const user = await attachmentsService.clearUserAvatar(req.auth.userId);
      res.json({ user: toSelfUser(user) });
    },

    async userAvatar(req, res) {
      const file = await attachmentsService.openUserAvatar(req.validated.params.userId);
      await sendFile(res, { ...file, inline: true }, { cacheSeconds: 86400 });
    },

    async setGroupAvatar(req, res) {
      await attachmentsService.setGroupAvatar(
        req.auth.userId,
        req.validated.params.conversationId,
        req.file,
      );
      res.status(204).end();
    },

    async clearGroupAvatar(req, res) {
      await attachmentsService.clearGroupAvatar(
        req.auth.userId,
        req.validated.params.conversationId,
      );
      res.status(204).end();
    },

    async groupAvatar(req, res) {
      const file = await attachmentsService.openGroupAvatar(
        req.auth.userId,
        req.validated.params.conversationId,
      );
      await sendFile(res, { ...file, inline: true }, { cacheSeconds: 86400 });
    },
  };
}
