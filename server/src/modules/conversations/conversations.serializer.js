import { toPublicUser } from '../users/users.serializer.js';
import { toLastMessage } from '../messages/messages.serializer.js';

function groupAvatarUrl(conversation) {
  return conversation.avatarPath
    ? `/api/conversations/${conversation.id}/avatar?v=${encodeURIComponent(conversation.avatarPath)}`
    : null;
}

/** One inbox row: the conversation plus the viewer's own state. */
export function toConversationSummary({
  conversation,
  member,
  unreadCount,
  counterpart,
  memberCount,
  lastMessage,
}) {
  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.type === 'group' ? conversation.name : null,
    avatarUrl: conversation.type === 'group' ? groupAvatarUrl(conversation) : null,
    counterpart: counterpart ? toPublicUser(counterpart) : null,
    memberCount,
    channel: Boolean(conversation.broadcast),
    description: conversation.broadcast ? (conversation.description ?? null) : null,
    isPublic: Boolean(conversation.broadcast && conversation.isPublic),
    role: member.role,
    unreadCount,
    archived: Boolean(member.archivedAt),
    muted: Boolean(member.mutedAt),
    disappearAfterSeconds: conversation.disappearAfterSeconds ?? null,
    encrypted: conversation.encrypted,
    lastMessage: lastMessage ? toLastMessage(lastMessage) : null,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
  };
}

/** A public channel as shown in discovery: enough to decide whether to join. */
export function toChannelListing({ conversation, memberCount }) {
  return {
    id: conversation.id,
    name: conversation.name,
    description: conversation.description ?? null,
    avatarUrl: groupAvatarUrl(conversation),
    memberCount,
  };
}

export function toMemberEntry({ member, user }) {
  return { ...toPublicUser(user), role: member.role, joinedAt: member.joinedAt };
}
