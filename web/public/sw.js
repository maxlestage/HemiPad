/*
 * Service worker de HemiPad.
 *
 * Trois règles, et rien d'autre :
 *
 * 1. Les fichiers versionnés par Vite (`/assets/nom.hash.js`) ne changent
 *    jamais sous le même nom : cache d'abord, réseau seulement s'ils manquent.
 * 2. Les navigations passent par le réseau d'abord, avec repli sur la page
 *    mise en cache. Une mise en ligne est donc visible tout de suite, et le
 *    site reste consultable dans le métro.
 * 3. Tout le reste (icônes, manifeste, polices) est servi depuis le cache tout
 *    en étant rafraîchi en arrière-plan.
 *
 * Changer VERSION invalide l'ancien cache : c'est le seul geste à faire quand
 * la coquille de l'application change.
 */

const VERSION = 'hemipad-v1'
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`

/** Ce qui doit être disponible hors connexion dès la première visite. */
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/hemipad-mark.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `addAll` échoue en bloc si une seule ressource manque : on met en
      // cache une par une pour qu'une icône absente ne prive pas la personne
      // du mode hors connexion.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // On ne touche ni aux écritures ni aux extensions du navigateur.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (!url.protocol.startsWith('http')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  if (url.origin === self.location.origin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE))
  }
})

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put('/', response.clone())
    }
    return response
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match('/'))
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)
  return cached || (await network) || Response.error()
}
