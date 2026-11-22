import { notFound } from '../../utils/errors.js';
import { toPublicUser } from './users.serializer.js';

export function createUsersService({ usersRepository, events }) {
  return {
    async updateDisplayName(userId, displayName) {
      const user = await usersRepository.update(userId, { displayName });
      if (!user) {
        throw notFound('User not found');
      }
      events.publish('user.updated', { userId });
      return user;
    },

    /** Directory search by username or display name. Never returns the caller or private fields. */
    async search(userId, query, limit) {
      const rows = await usersRepository.search(query, { excludeId: userId, limit });
      return rows.map(toPublicUser);
    },
  };
}
