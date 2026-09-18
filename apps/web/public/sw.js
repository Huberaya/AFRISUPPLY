// Service worker AFRISUPPLY : coquille de l'app en cache (ouverture instantanée, même hors réseau) ; l'API reste toujours en ligne.
const VERSION = 'afs-v1';
const SHELL = ['/', '/app', '/manifest.webmanifest', '/favicon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // assets versionnés : cache d'abord ; navigation : réseau d'abord avec repli sur la coquille
  if (url.pathname.startsWith('/assets/')) { e.respondWith(caches.match(e.request).then((r) => r ?? fetch(e.request).then((res) => { const cp = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, cp)); return res; }))); return; }
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).then((res) => { const cp = res.clone(); caches.open(VERSION).then((c) => c.put('/app', cp)); return res; }).catch(() => caches.match('/app').then((r) => r ?? caches.match('/')))); }
});
