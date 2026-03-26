// @ts-nocheck

import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

import {
  isBypassedServiceWorkerPath,
  isManagedStaticAssetPath,
  isManagedStaticDataPath,
  normalizeScopePath
} from '@/services/pwa/serviceWorkerPaths'

const PAGE_CACHE = 'comfyui-frontend-pages'
const STATIC_CACHE = 'comfyui-frontend-static'
const DATA_CACHE = 'comfyui-frontend-data'
const SCOPE_PATH = normalizeScopePath(new URL(self.registration.scope).pathname)

clientsClaim()

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ request, url }) =>
    request.mode === 'navigate' &&
    url.origin === self.location.origin &&
    !isBypassedServiceWorkerPath(url.pathname, SCOPE_PATH),
  new NetworkFirst({
    cacheName: PAGE_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 8,
        maxAgeSeconds: 24 * 60 * 60
      })
    ]
  })
)

registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    isManagedStaticDataPath(url.pathname, SCOPE_PATH),
  new StaleWhileRevalidate({
    cacheName: DATA_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 64,
        maxAgeSeconds: 7 * 24 * 60 * 60
      })
    ]
  })
)

registerRoute(
  ({ request, url }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    isManagedStaticAssetPath(url.pathname, SCOPE_PATH),
  new CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 256,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true
      })
    ]
  })
)
