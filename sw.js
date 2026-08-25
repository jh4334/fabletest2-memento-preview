// AI 윤리 어드벤처 — 오프라인 서비스워커
// 모든 정적 자원을 처음 방문 때 캐시해, 이후 네트워크 없이도 실행되게 한다.
// 게임 코드/콘텐츠가 바뀌면 CACHE 버전을 올리면 된다.
const CACHE = 'ai-ethics-adventure-c7f356e5';
const ASSETS = [
  './',
  './index.html',
  './src/sprites.js',
  './src/audio.js',
  './src/data.js',
  './src/game.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => {
    const replacingBaseline = keys.some((key) => key.startsWith('shadow-school-'));
    const ownedCaches = keys.filter((key) =>
      key !== CACHE && (key.startsWith('ai-ethics-adventure-') || key.startsWith('shadow-school-'))
    );
    return Promise.all(ownedCaches.map((key) => caches.delete(key)))
      .then(() => self.clients.claim())
      .then(() => replacingBaseline ? self.clients.matchAll({ type: 'window', includeUncontrolled: true }) : [])
      .then((clients) => {
        clients.forEach((client) => { client.navigate(client.url).catch(() => {}); });
      });
  }));
});

function remember(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return response;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const isNav = e.request.mode === 'navigate';
  const url = new URL(e.request.url);
  const isLocal = url.origin === self.location.origin;
  const isCore = isLocal && (
    isNav ||
    url.pathname.endsWith('/index.html') ||
    /\/src\/[^/]+\.js$/.test(url.pathname) ||
    url.pathname.endsWith('/manifest.webmanifest')
  );

  if (isCore) {
    const fallback = () => caches.match(e.request, { ignoreSearch: true })
      .then((hit) => hit || (isNav ? caches.match('./index.html') : undefined));
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.status >= 200 && response.status < 400) {
            return remember(e.request, response);
          }
          return fallback().then((hit) => hit || response);
        })
        .catch(fallback)
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((response) => remember(e.request, response)).catch(() => undefined);
    })
  );
});
