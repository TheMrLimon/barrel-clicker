/* ------------------------------------------------------------------
   Barrel Clicker 2 — service worker
   Кэширует игру целиком, чтобы она работала офлайн с домашнего экрана.
   При обновлении версии меняйте CACHE — старые кэши удалятся сами.
------------------------------------------------------------------- */

const CACHE = 'barrel-clicker-2-20261114a';

const CORE = [
  './',
  'index.html',
  'assets/style.css',
  'assets/game.bundle.js',
  'assets/vendor/supabase.js',
  'assets/account-config.js',
  'assets/account.js',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/icons/favicon-48.png',
];

const SHELL = new URL('index.html', self.location.href).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Навигация: сначала сеть, при отсутствии связи — сохранённая игра */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(SHELL, copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches
            .match(SHELL, { ignoreSearch: true })
            .then((cached) => cached || caches.match(new URL('./', self.location.href).href)),
        ),
    );
    return;
  }

  /* Остальное: из кэша сразу, в фоне обновляем */
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});
