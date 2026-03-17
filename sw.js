const CACHE = 'hormuz-v12';
const ASSETS = [
  './',
  './index.html',
  './js/zzfx.js',
  './js/sounds.js',
  './js/map.js',
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
  './sprites/ship.svg',
  './sprites/shahed.svg',
  './sprites/missile.svg',
  './sprites/shahed-exploding.svg',
  './sprites/missile-blast.svg',
  './sprites/missile_oceandrop.svg',
  './sprites/ship-struck.svg'
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
