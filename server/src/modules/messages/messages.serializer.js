import { toAttachment } from '../attachments/attachments.serializer.js';

const STATE_RANK = { sent: 0, delivered: 1, read: 2 };

export function receiptState(row) {
  if (row?.readAt) {
    return 'read';
  }
  if (row?.deliveredAt) {
    return 'delivered';
  }
  return 'sent';
}

export function betterState(a, b) {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

/**
 * Shape one message for the API. receipts lists one entry per current recipient (every member but
 * the sender) so clients can derive sent, delivered, or read, for direct and group chats alike.
 */
export function toMessage({ message, attachment }, { recipientIds, receiptRows = [] }) {
  const byUser = new Map(receiptRows.map((row) => [row.userId, row]));
  const deleted = Boolean(message.deletedAt);
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    clientId: message.clientId,
    body: deleted ? '' : message.body,
    attachment: deleted ? null : toAttachment(attachment),
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
    receipts: recipientIds
      .filter((userId) => userId !== message.senderId)
      .map((userId) => ({ userId, state: receiptState(byUser.get(userId)) })),
  };
}

const PREVIEW_LENGTH = 140;

/** Compact form used for the conversation list preview. */
export function toLastMessage({ message, attachment }) {
  const deleted = Boolean(message.deletedAt);
  return {
    id: message.id,
    senderId: message.senderId,
    body: deleted ? '' : message.body.slice(0, PREVIEW_LENGTH),
    deleted,
    attachmentName: !deleted && attachment ? attachment.originalName : null,
    attachmentKind: !deleted && attachment ? toAttachment(attachment).kind : null,
    createdAt: message.createdAt,
  };
}
