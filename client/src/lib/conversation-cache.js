/* Pure helpers over the conversation list returned by GET /api/conversations. */

export function conversationTitle(conversation) {
  if (conversation.type === 'group') {
    return conversation.name ?? 'Group';
  }
  return conversation.counterpart?.displayName ?? 'Unknown user';
}

export function sortConversations(list) {
  return [...list].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

/** Preview line for the list: attachment name, deleted notice, or the start of the text. */
export function previewText(conversation, meId) {
  const last = conversation.lastMessage;
  if (!last) {
    return 'No messages yet';
  }
  const prefix = last.senderId === meId ? 'You: ' : '';
  if (last.deleted) {
    return `${prefix}Message deleted`;
  }
  if (last.encrypted) {
    return `${prefix}Encrypted message`;
  }
  if (last.body) {
    return `${prefix}${last.body}`;
  }
  if (last.attachmentKind === 'voice') {
    return `${prefix}Voice note`;
  }
  return `${prefix}${last.attachmentKind === 'image' ? 'Photo' : 'File'}: ${last.attachmentName}`;
}

/**
 * Filter the inbox. scope "groups" limits to group chats; filter is all | unread | archived.
 * Archived conversations only appear under the archived filter. query matches the title.
 */
export function filterConversations(list, { scope = 'all', filter = 'all', query = '' }) {
  const needle = query.trim().toLowerCase();
  return list.filter((conversation) => {
    if (scope === 'groups' && conversation.type !== 'group') {
      return false;
    }
    if (filter === 'archived') {
      if (!conversation.archived) {
        return false;
      }
    } else if (conversation.archived) {
      return false;
    }
    if (filter === 'unread' && conversation.unreadCount === 0) {
      return false;
    }
    return !needle || conversationTitle(conversation).toLowerCase().includes(needle);
  });
}

/**
 * Update one conversation for a newly arrived message. Returns null when the conversation is not
 * in the list (the caller then refetches). The unread count only grows for messages from others
 * in a conversation the user is not looking at.
 */
export function applyIncomingMessage(list, message, { meId, isViewing }) {
  if (!list.some((conversation) => conversation.id === message.conversationId)) {
    return null;
  }
  return sortConversations(
    list.map((conversation) => {
      if (conversation.id !== message.conversationId) {
        return conversation;
      }
      const fromOther = message.senderId !== meId;
      const alreadyCounted = (conversation.lastMessage?.id ?? 0) >= message.id;
      return {
        ...conversation,
        lastMessage: alreadyCounted
          ? conversation.lastMessage
          : {
              id: message.id,
              senderId: message.senderId,
              body: message.encrypted ? '' : message.body.slice(0, 140),
              encrypted: Boolean(message.encrypted),
              deleted: false,
              attachmentName: message.attachment?.name ?? null,
              attachmentKind: message.attachment?.kind ?? null,
              createdAt: message.createdAt,
            },
        lastMessageAt: alreadyCounted ? conversation.lastMessageAt : message.createdAt,
        unreadCount:
          alreadyCounted || !fromOther || isViewing
            ? conversation.unreadCount
            : conversation.unreadCount + 1,
        archived:
          fromOther && !alreadyCounted && !conversation.muted ? false : conversation.archived,
      };
    }),
  );
}
