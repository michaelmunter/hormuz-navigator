const CACHE = 'hormuz-v17';
const ASSETS = [
  './',
  './index.html',
  './js/zzfx.js',
  './js/sounds.js',
  './js/map.js',
  './js/ships.js',
  './js/roles.js',
  './js/crew.js',
  './js/worldmap.js',
  './js/dock.js',
  './js/renderer.js',
  './js/minesweeper.js',
  './js/transit.js',
  './js/input.js',
  './js/game.js',
  './hormuz-ocean.png',
  './hormuz-land.png',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
  './sprites/ships/ship-1.png',
  './sprites/shahed.png',
  './sprites/missile.png',
  './sprites/shahed-exploding.png',
  './sprites/explosion.png',
  './sprites/missile_oceandrop.png'
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
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(e.request);
      if (response && response.ok) {
        cache.put(e.request, response.clone());
      }
      return response;
    } catch (err) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      throw err;
    }
  })());
});
