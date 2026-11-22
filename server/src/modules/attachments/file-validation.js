import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { unsupportedMedia } from '../../utils/errors.js';

/*
 * Uploads are validated by content, never by the client-supplied name or Content-Type.
 * SVG and HTML are deliberately absent: both can carry script and are never served inline.
 */
const BINARY_ALLOW = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg',
  'video/mp4',
]);

// Types file-type cannot identify by signature. Accepted only by extension plus a text check.
const TEXT_EXTENSIONS = {
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.md': 'text/markdown',
  '.json': 'application/json',
};

// Legacy Office files share one container signature (CFB), so the extension picks the type.
const LEGACY_OFFICE = {
  '.doc': 'application/msword',
  '.xls': 'application/vnd.ms-excel',
  '.ppt': 'application/vnd.ms-powerpoint',
};

export const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function isPlainUtf8(buffer) {
  if (buffer.includes(0)) {
    return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/** Strip any path, control characters and quotes from a client file name and cap its length. */
export function sanitizeFileName(name) {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  const limited = cleaned.length > 150 ? cleaned.slice(-150) : cleaned;
  return limited || 'file';
}

/**
 * Decide the real MIME type of an upload from its bytes. Returns { mimeType }.
 * Throws a 415 AppError when the content is not on the allow-list.
 */
export async function detectMime(buffer, originalName) {
  if (buffer.length === 0) {
    throw unsupportedMedia('The file is empty');
  }
  const extension = path.extname(originalName).toLowerCase();
  const detected = await fileTypeFromBuffer(buffer);

  if (detected) {
    if (BINARY_ALLOW.has(detected.mime)) {
      return { mimeType: detected.mime };
    }
    if (detected.mime === 'application/x-cfb' && LEGACY_OFFICE[extension]) {
      return { mimeType: LEGACY_OFFICE[extension] };
    }
    throw unsupportedMedia();
  }

  if (TEXT_EXTENSIONS[extension] && isPlainUtf8(buffer)) {
    return { mimeType: TEXT_EXTENSIONS[extension] };
  }
  throw unsupportedMedia();
}
