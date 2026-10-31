/* Service Worker – Aufgabenverwaltung PWA */
const CACHE = 'aufgaben-v13';
const ASSETS = [
  './','./index.html','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png','./icons/favicon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // Fremde Server (z. B. Nextcloud-WebDAV) nie aus dem Cache bedienen
  if (new URL(request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(resp => {
      if (resp.ok && new URL(request.url).origin === self.location.origin) {
        const copy = resp.clone(); caches.open(CACHE).then(c => c.put(request, copy));
      }
      return resp;
    }).catch(() => caches.match('./index.html'));
  }));
});
