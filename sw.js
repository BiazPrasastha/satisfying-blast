/* Satisfy Blast service worker.
   Bump VERSION when the app shell changes so old caches are dropped. */
const VERSION = 'satisfy-blast-v5';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './engine.js',
  './highscore.js',
  './game.js',
  './favicon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cachePut(cache, request, response) {
  if (response && (response.ok || response.type === 'opaque')) {
    try { await cache.put(request, response.clone()); } catch (e) { /* ignore */ }
  }
}

// Fresh when online, with the cached copy as the offline fallback.
async function networkFirst(request, fallback) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    await cachePut(cache, request, response);
    return response;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (fallback) {
      const shell = await cache.match(fallback);
      if (shell) return shell;
    }
    throw e;
  }
}

// Serve the cached copy at once, refresh it in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const network = fetch(request).then(response => {
    cachePut(cache, request, response);
    return response;
  }).catch(() => null);
  if (hit) { network; return hit; }
  const response = await network;
  return response || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Any in-app route resolves to the single page, so deep links work offline too.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
