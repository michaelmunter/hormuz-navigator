const CACHE = 'hormuz-v1';
const ASSETS = [
  '/hormuz-navigator/',
  '/hormuz-navigator/index.html',
  '/hormuz-navigator/hormuz.png',
  '/hormuz-navigator/icon-192.png',
  '/hormuz-navigator/icon-512.png',
  '/hormuz-navigator/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
