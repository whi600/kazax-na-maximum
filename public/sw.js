const CACHE_NAME = 'kofeteriy-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/app-version.json']

const isNavigationRequest = (request) =>
  request.mode === 'navigate' ||
  (request.headers.get('accept') || '').includes('text/html')

const putCache = async (request, response) => {
  if (!response || !response.ok) return
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
}

const networkFirst = async (request) => {
  try {
    const response = await fetch(request)
    await putCache(request, response)
    return response
  } catch {
    return (await caches.match(request)) || caches.match('/index.html')
  }
}

const cacheFirst = async (request) => {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  await putCache(request, response)
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (url.pathname === '/app-version.json' || isNavigationRequest(event.request)) {
    event.respondWith(networkFirst(event.request))
    return
  }

  event.respondWith(cacheFirst(event.request))
})

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data?.json() || {}
    } catch {
      return {}
    }
  })()

  const title = payload.title || 'Кофетерий'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'kofeteriy-notification',
    data: {
      url: payload.url || '/',
    },
    renotify: Boolean(payload.renotify),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin) {
          client.focus()
          if (clientUrl.pathname !== targetUrl && 'navigate' in client) {
            return client.navigate(targetUrl).then(() => client.focus())
          }
          return client.focus()
        }
      }

      return self.clients.openWindow(targetUrl)
    }),
  )
})
