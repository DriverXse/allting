const CACHE = 'allting-offline-v4';
const FALLBACK = '/offline.html';
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch(FALLBACK, { cache: 'reload' });
  const html = await response.text();
  if (!response.ok || !html.includes('name="allting-offline" content="v1"'))
    throw new Error('AllTings offline-sida kunde inte hämtas.');
  // Sites canonicalizes .html URLs. A redirected response cannot be used for
  // an offline navigation; store only the verified, generic HTML body.
  const cache = await caches.open(CACHE);
  await cache.put(FALLBACK, new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate')
    event.respondWith(fetch(event.request).catch(() => caches.match(FALLBACK)));
});
