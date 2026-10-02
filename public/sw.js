/* Command Center service worker.
 * - App shell: cache-first for hashed /assets, network-first for navigations.
 * - Data (data/*.json): network-first, fall back to the last cached copy when offline.
 *   The cached data file is the *encrypted* envelope on public hosting.
 * - GitHub API and cross-origin requests: never cached.
 */
const VERSION = 'v2';
const SHELL = `kp7-shell-${VERSION}`;
const DATA = `kp7-data-${VERSION}`;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, cacheKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(cacheKey || request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey || request);
    if (!hit) throw err;
    // Mark cache fallbacks so the app can honestly say "Offline — showing cached data".
    const headers = new Headers(hit.headers);
    headers.set('x-kp7-from-cache', '1');
    return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/')) {
    // Ignore cache-busting query when storing so offline lookups still match.
    const key = new Request(url.origin + url.pathname);
    event.respondWith(networkFirst(req, DATA, key));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
