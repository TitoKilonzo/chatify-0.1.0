import { createHmac } from 'node:crypto';

/**
 * ICE servers for a call. STUN lets two browsers find each other; TURN relays media when a direct
 * path is impossible (strict NATs, many mobile networks). TURN credentials follow the "TURN REST
 * API" convention understood by coturn with use-auth-secret: a username that carries its own expiry
 * and an HMAC-SHA1 of it, so no per-user account is needed on the relay and nothing long-lived is
 * ever sent to a browser.
 */
export function buildIceServers(env, userId, now = new Date()) {
  const servers = [];
  if (env.STUN_URLS.length > 0) {
    servers.push({ urls: env.STUN_URLS });
  }
  if (env.TURN_URLS.length > 0 && env.TURN_SECRET) {
    const expires = Math.floor(now.getTime() / 1000) + env.TURN_TTL_SECONDS;
    const username = `${expires}:${userId}`;
    const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
    servers.push({ urls: env.TURN_URLS, username, credential });
  }
  return servers;
}
