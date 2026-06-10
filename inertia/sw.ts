import { defaultCache } from '@serwist/vite/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

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

const runtimeCaching: RuntimeCaching[] = [...noPrivateCache, ...defaultCache]

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
