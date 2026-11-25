/** The user shape returned to the signed-in user about themselves. Never includes secrets. */
export function toSelfUser(user) {
  return {
    id: user.id,
    username: user.username,
    // Accounts created with a phone number have an internal address that is never shown.
    email: user.email.endsWith('.invalid') ? null : user.email,
    phone: user.phone ?? null,
    displayName: user.displayName,
    avatarUrl: avatarUrl(user),
    status: user.status,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
  };
}

/** The user shape visible to other users. No email, no lockout or credential fields. */
export function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: avatarUrl(user),
    status: user.status,
    lastSeenAt: user.lastSeenAt,
  };
}

// The avatar is served by an authenticated endpoint; the version query busts caches on change.
function avatarUrl(user) {
  return user.avatarPath
    ? `/api/users/${user.id}/avatar?v=${encodeURIComponent(user.avatarPath)}`
    : null;
}
