// Only here for browser notifications on phones and for installing the app. It caches nothing: files are
// cached by the browser, and prices and portfolios need the network anyway.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(open => open[0] ? open[0].focus() : self.clients.openWindow('/')))
})
