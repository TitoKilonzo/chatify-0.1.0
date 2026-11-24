import { pipeline } from 'node:stream/promises';
import { toSelfUser } from '../users/users.serializer.js';

const FILE_CSP = "default-src 'none'; sandbox";

/** Stream a stored file with headers that make browsers treat it as inert data. */
/** Parse a single-range header; null means serve the whole file, 'invalid' means 416. */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(size - Number(match[2]), 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start > end || start >= size ? 'invalid' : { start, end };
}

async function sendFile(res, file, { cacheSeconds, rangeHeader }) {
  if (file.url) {
    // Cloud storage: the caller is already authorized. The response type and disposition are part
    // of the signature, and the bucket lives on another origin, so a file cannot run in this app.
    res.set({
      'Cache-Control': `private, max-age=${file.redirectCacheSeconds}`,
      'Referrer-Policy': 'no-referrer',
    });
    res.redirect(302, file.url);
    return;
  }
  const range = file.range ? parseRange(rangeHeader, file.size) : null;
  if (range === 'invalid') {
    res.status(416).set('Content-Range', `bytes */${file.size}`).end();
    file.stream.destroy();
    return;
  }
  res.set('Accept-Ranges', 'bytes');
  res.set({
    'Content-Length': String(range ? range.end - range.start + 1 : file.size),
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
    if (range) {
      file.stream.destroy();
      res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
      await pipeline(file.range(range.start, range.end), res);
    } else {
      await pipeline(file.stream, res);
    }
  } catch {
    // The client went away or the file vanished mid-stream. Nothing useful remains to send.
    res.destroy();
  }
}

export function createAttachmentsController({ attachmentsService }) {
  return {
    async upload(req, res) {
      const voice = req.body?.voice === '1';
      const duration = Number(req.body?.durationMs);
      const attachment = await attachmentsService.upload(req.auth.userId, req.file, {
        voice,
        durationMs:
          voice && Number.isFinite(duration)
            ? Math.min(Math.max(Math.round(duration), 0), 3_600_000)
            : null,
      });
      res.status(201).json({ attachment });
    },

    async download(req, res) {
      const file = await attachmentsService.open(
        req.auth.userId,
        req.validated.params.attachmentId,
      );
      await sendFile(res, file, { cacheSeconds: 3600, rangeHeader: req.get('range') });
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
