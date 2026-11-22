/*
 * Chatify service worker. Deliberately small: it makes the app installable and shows a friendly
 * page when a navigation fails because the device is offline. It never caches API responses,
 * sockets, uploads or any signed-in data, so nothing private is stored by the worker.
 */
const VERSION = 'v1';
const CACHE = `chatify-shell-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(OFFLINE_URL, { cache: 'reload' });
      if (!response.ok) {
        throw new Error('offline page unavailable');
      }
      const html = await response.clone().text();
      await cache.put(OFFLINE_URL, response);
      // The offline page links its own hashed script, stylesheets and icon; keep them with it.
      // A Set removes repeats, because cache.addAll rejects duplicate requests.
      const matches = html.matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js|svg|png))"/g);
      const assets = [...new Set([...matches].map((match) => match[1]))];
      await cache.addAll(assets);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE && name.startsWith('chatify-'))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only page navigations are handled. Everything else goes straight to the network untouched.
  if (request.mode !== 'navigate' || request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }),
  );
});
