const IMAGE_MIME = /^image\/(png|jpeg|gif|webp)$/;

export function toAttachment(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    kind: row.isVoice ? 'voice' : IMAGE_MIME.test(row.mimeType) ? 'image' : 'file',
    durationMs: row.durationMs ?? null,
    url: `/api/attachments/${row.id}`,
    thumbnailUrl: row.thumbnailKey ? `/api/attachments/${row.id}/thumbnail` : null,
  };
}
