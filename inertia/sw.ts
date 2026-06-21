import { defaultCache } from '@serwist/vite/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import { NetworkFirst, NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: WorkerGlobalScope & { __SW_MANIFEST?: (PrecacheEntry | string)[] }

const PRIVATE_PREFIXES = ['/admin', '/login', '/register', '/api/']

function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p)
  )
}

const noPrivateCache: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && isPrivatePath(url.pathname),
    handler: new NetworkOnly(),
  },
]

// Public page documents (builder pages, posts, home) — network-first so they
// work offline once visited; the `/offline` fallback covers a cold cache.
const publicPageCache: RuntimeCaching[] = [
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin && request.destination === 'document' && !isPrivatePath(url.pathname),
    handler: new NetworkFirst({ cacheName: 'public-pages', networkTimeoutSeconds: 3 }),
  },
]

const runtimeCaching: RuntimeCaching[] = [...noPrivateCache, ...publicPageCache, ...defaultCache]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
