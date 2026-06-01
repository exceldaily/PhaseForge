// Ganttic Service Worker — enables PWA installability on Windows & macOS

const CACHE_VERSION = 'ganttic-v1'
const OFFLINE_PAGE = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll([OFFLINE_PAGE]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return
  if (event.request.url.includes('/api/')) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_PAGE).then((cached) => cached ?? Response.error())
      )
    )
  }
})
