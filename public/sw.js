// Opens instantly by serving the app's files from the cache, then refreshes them for next time.
// Market data under /api always goes to the network, so prices can't go stale.
const CACHE = 'littlebulls-1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request)
    const fresh = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r })
    if (hit) { fresh.catch(() => {}); return hit }
    return fresh
  }))
})
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.openWindow('/')) })
