// Offline cache. Bump the version number whenever the game changes.
const VERSION = 'peng-v6';
const FONT_HOST = 'fonts.bunny.net';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/lights.css',
  'js/app.js',
  'js/audio.js',
  'js/ha.js',
  'js/i18n.js',
  'js/tasks.js',
  'data/syllables.js',
  'data/questions.js',
  'data/compounds.js',
  'data/scramble.js',
  'data/chains.js',
  'icons/icon.svg',
];

// Fetch every file past the browser's HTTP cache, so one version never mixes with another
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Answer from the cache straight away and refresh in the background. Fonts are cached on first load.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  if (req.method !== 'GET' || (!own && url.hostname !== FONT_HOST)) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: own });
      const fresh = fetch(req, own ? { cache: 'no-cache' } : undefined)
        .then((res) => {
          // Addresses with a query (test fuse, sign-in return) are served but never stored
          if (res && (res.ok || res.type === 'opaque') && !(own && url.search)) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
