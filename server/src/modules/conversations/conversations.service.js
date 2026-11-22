import { forbidden, notFound, validationFailed } from '../../utils/errors.js';
import { toConversationSummary, toMemberEntry } from './conversations.serializer.js';

export const MAX_GROUP_MEMBERS = 256;

/**
 * Conversation business logic. Non-members always receive 404 so conversation ids cannot be probed.
 * Group permissions: the owner can do everything; admins manage members below their own rank;
 * members can only leave.
 */
export function createConversationsService({
  conversationsRepository,
  messagesRepository,
  usersRepository,
  events,
}) {
  async function requireMember(conversationId, userId) {
    const member = await conversationsRepository.findMember(conversationId, userId);
    if (!member) {
      throw notFound('Conversation not found');
    }
    return member;
  }

  async function requireGroupManager(conversationId, userId) {
    const member = await requireMember(conversationId, userId);
    const conversation = await conversationsRepository.findById(conversationId);
    if (conversation.type !== 'group') {
      throw validationFailed([{ path: 'conversationId', message: 'Not a group conversation' }]);
    }
    if (member.role === 'member') {
      throw forbidden('NOT_GROUP_ADMIN', 'Only group admins can do that');
    }
    return { member, conversation };
  }

  async function notifyChanged(conversationId, reason, { added = [], removed = [] } = {}) {
    const userIds = await conversationsRepository.listMemberIds(conversationId);
    events.publish('conversation.changed', {
      conversationId,
      userIds,
      addedUserIds: added,
      removedUserIds: removed,
      reason,
    });
  }

  async function ensureUsersExist(userIds) {
    const found = await usersRepository.findManyByIds(userIds);
    if (found.length !== userIds.length) {
      throw validationFailed([{ path: 'memberIds', message: 'One or more users do not exist' }]);
    }
  }

  async function summarize(conversationId, userId) {
    const member = await requireMember(conversationId, userId);
    const conversation = await conversationsRepository.findById(conversationId);
    const [members, unreadCount, last] = await Promise.all([
      conversationsRepository.listMembers(conversationId),
      conversationsRepository.unreadCount(conversationId, userId),
      messagesRepository.lastForConversations([conversationId]),
    ]);
    const counterpart =
      conversation.type === 'direct'
        ? (members.find((entry) => entry.user.id !== userId)?.user ?? null)
        : null;
    return {
      summary: toConversationSummary({
        conversation,
        member,
        unreadCount,
        counterpart,
        memberCount: members.length,
        lastMessage: last.get(conversationId) ?? null,
      }),
      members,
    };
  }

  return {
    async list(userId) {
      const { rows, unread, counterparts, memberCounts } =
        await conversationsRepository.listForUser(userId);
      const last = await messagesRepository.lastForConversations(
        rows.map((row) => row.conversation.id),
      );
      return rows.map(({ conversation, member }) =>
        toConversationSummary({
          conversation,
          member,
          unreadCount: unread.get(conversation.id) ?? 0,
          counterpart: counterparts.get(conversation.id) ?? null,
          memberCount:
            conversation.type === 'direct' ? 2 : (memberCounts.get(conversation.id) ?? 0),
          lastMessage: last.get(conversation.id) ?? null,
        }),
      );
    },

    async get(userId, conversationId) {
      const { summary, members } = await summarize(conversationId, userId);
      return { ...summary, members: members.map(toMemberEntry) };
    },

    async openDirect(userId, otherUserId) {
      if (otherUserId === userId) {
        throw validationFailed([{ path: 'userId', message: 'You cannot message yourself' }]);
      }
      const other = await usersRepository.findById(otherUserId);
      if (!other) {
        throw notFound('User not found');
      }
      const { conversation, created } = await conversationsRepository.getOrCreateDirect(
        userId,
        otherUserId,
      );
      if (created) {
        await notifyChanged(conversation.id, 'created', { added: [userId, otherUserId] });
      }
      const { summary } = await summarize(conversation.id, userId);
      return { conversation: summary, created };
    },

    async createGroup(userId, { name, memberIds }) {
      const others = [...new Set(memberIds)].filter((id) => id !== userId);
      if (others.length === 0) {
        throw validationFailed([{ path: 'memberIds', message: 'Add at least one other person' }]);
      }
      if (others.length + 1 > MAX_GROUP_MEMBERS) {
        throw validationFailed([
          { path: 'memberIds', message: `Groups can have at most ${MAX_GROUP_MEMBERS} members` },
        ]);
      }
      await ensureUsersExist(others);
      const conversation = await conversationsRepository.createGroup({
        name,
        createdBy: userId,
        memberIds: others,
      });
      await notifyChanged(conversation.id, 'created', { added: [userId, ...others] });
      const { summary } = await summarize(conversation.id, userId);
      return summary;
    },

    async rename(userId, conversationId, name) {
      await requireGroupManager(conversationId, userId);
      await conversationsRepository.updateConversation(conversationId, { name });
      await notifyChanged(conversationId, 'renamed');
      return this.get(userId, conversationId);
    },

    async addMembers(userId, conversationId, userIds) {
      await requireGroupManager(conversationId, userId);
      const existing = new Set(await conversationsRepository.listMemberIds(conversationId));
      const fresh = [...new Set(userIds)].filter((id) => !existing.has(id));
      if (existing.size + fresh.length > MAX_GROUP_MEMBERS) {
        throw validationFailed([
          { path: 'userIds', message: `Groups can have at most ${MAX_GROUP_MEMBERS} members` },
        ]);
      }
      await ensureUsersExist(fresh);
      await conversationsRepository.addMembers(conversationId, fresh);
      if (fresh.length > 0) {
        await notifyChanged(conversationId, 'members-added', { added: fresh });
      }
      return this.get(userId, conversationId);
    },

    async removeMember(userId, conversationId, targetId) {
      const { member } = await requireGroupManager(conversationId, userId);
      if (targetId === userId) {
        throw validationFailed([{ path: 'userId', message: 'Use leave to exit a group' }]);
      }
      const target = await conversationsRepository.findMember(conversationId, targetId);
      if (!target) {
        throw notFound('Member not found');
      }
      if (target.role === 'owner' || (member.role === 'admin' && target.role === 'admin')) {
        throw forbidden('CANNOT_REMOVE_MEMBER', 'You cannot remove that member');
      }
      await conversationsRepository.removeMember(conversationId, targetId);
      await notifyChanged(conversationId, 'member-removed', { removed: [targetId] });
      return this.get(userId, conversationId);
    },

    async setRole(userId, conversationId, targetId, role) {
      const { member } = await requireGroupManager(conversationId, userId);
      if (member.role !== 'owner') {
        throw forbidden('NOT_GROUP_OWNER', 'Only the group owner can change roles');
      }
      if (targetId === userId) {
        throw validationFailed([{ path: 'userId', message: 'You cannot change your own role' }]);
      }
      const target = await conversationsRepository.findMember(conversationId, targetId);
      if (!target) {
        throw notFound('Member not found');
      }
      await conversationsRepository.setRole(conversationId, targetId, role);
      await notifyChanged(conversationId, 'role-changed');
      return this.get(userId, conversationId);
    },

    /** Leave a group. The owner role passes to the longest-standing admin, else member. */
    async leave(userId, conversationId) {
      const member = await requireMember(conversationId, userId);
      const conversation = await conversationsRepository.findById(conversationId);
      if (conversation.type !== 'group') {
        throw validationFailed([
          {
            path: 'conversationId',
            message: 'Direct conversations cannot be left; archive instead',
          },
        ]);
      }
      const members = await conversationsRepository.listMembers(conversationId);
      const remaining = members.filter((entry) => entry.user.id !== userId);

      if (remaining.length === 0) {
        await conversationsRepository.deleteConversation(conversationId);
        events.publish('conversation.changed', {
          conversationId,
          userIds: [],
          addedUserIds: [],
          removedUserIds: [userId],
          reason: 'deleted',
        });
        return;
      }

      if (member.role === 'owner') {
        const successor = remaining.find((entry) => entry.member.role === 'admin') ?? remaining[0];
        await conversationsRepository.setRole(conversationId, successor.user.id, 'owner');
      }
      await conversationsRepository.removeMember(conversationId, userId);
      await notifyChanged(conversationId, 'member-left', { removed: [userId] });
    },

    /** Per-user archive and mute flags. Only provided fields change. */
    async setPreferences(userId, conversationId, { archived, muted }) {
      await requireMember(conversationId, userId);
      const values = {};
      if (archived !== undefined) {
        values.archivedAt = archived ? new Date() : null;
      }
      if (muted !== undefined) {
        values.mutedAt = muted ? new Date() : null;
      }
      if (Object.keys(values).length > 0) {
        await conversationsRepository.setPreferences(conversationId, userId, values);
        events.publish('conversation.changed', {
          conversationId,
          userIds: [userId],
          addedUserIds: [],
          removedUserIds: [],
          reason: 'preferences',
        });
      }
      const { summary } = await summarize(conversationId, userId);
      return summary;
    },
  };
}
