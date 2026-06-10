import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePage } from '@inertiajs/react'
import { useAbility } from '~/components/providers/ability-provider'
import {
  DexieLocalStore,
  MemoryLocalStore,
  NullLocalStore,
  SyncEngine,
  detectStorageMode,
  type EngineSnapshot,
  type LocalStore,
  type StorageMode,
} from '~/lib/offline'
import { namespaceFromUserId } from '~/lib/offline/namespace'

interface OfflineContextValue {
  store: LocalStore | null
  engine: SyncEngine | null
  mode: StorageMode | 'loading'
  degraded: boolean
  snapshot: EngineSnapshot | null
  syncNow: () => void
}

const OfflineContext = createContext<OfflineContextValue>({
  store: null,
  engine: null,
  mode: 'loading',
  degraded: false,
  snapshot: null,
  syncNow: () => {},
})

export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext)
}

function disableFlag(): boolean {
  return import.meta.env.VITE_DISABLE_OFFLINE === '1'
}

function instantiateStore(mode: StorageMode, namespace: string): LocalStore {
  if (mode === 'disabled') return new NullLocalStore(namespace)
  if (mode === 'idb') return new DexieLocalStore(namespace)
  return new MemoryLocalStore(namespace)
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { props } = usePage<{ user?: { id?: number } }>()
  const { me } = useAbility()
  const userId = me?.id ?? props.user?.id
  const namespace = useMemo(() => namespaceFromUserId(userId != null ? String(userId) : null), [userId])

  const [mode, setMode] = useState<StorageMode | 'loading'>(disableFlag() ? 'disabled' : 'loading')
  const [store, setStore] = useState<LocalStore | null>(null)
  const [engine, setEngine] = useState<SyncEngine | null>(null)
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const teardownRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (disableFlag()) return
    let cancelled = false
    void detectStorageMode().then((m) => {
      if (!cancelled) setMode(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mode === 'loading') return
    let cancelled = false

    const nextStore = instantiateStore(mode, namespace)
    const nextEngine = new SyncEngine(nextStore)

    const unsub = nextEngine.subscribe((s) => {
      if (!cancelled) setSnapshot(s)
    })

    void nextStore
      .ready()
      .then(() => {
        if (cancelled) return
        nextEngine.start()
        setStore(nextStore)
        setEngine(nextEngine)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[offline] store init failed, falling back to memory', err)
        const fallback = new MemoryLocalStore(namespace)
        const fallbackEngine = new SyncEngine(fallback)
        fallbackEngine.subscribe((s) => {
          if (!cancelled) setSnapshot(s)
        })
        void fallback.ready().then(() => {
          if (cancelled) return
          fallbackEngine.start()
          setStore(fallback)
          setEngine(fallbackEngine)
          setMode('memory')
        })
      })

    teardownRef.current = () => {
      cancelled = true
      unsub()
      nextEngine.stop()
      void nextStore.close()
    }

    return () => {
      teardownRef.current?.()
      teardownRef.current = null
      setStore(null)
      setEngine(null)
      setSnapshot(null)
    }
  }, [mode, namespace])

  const value = useMemo<OfflineContextValue>(
    () => ({
      store,
      engine,
      mode,
      degraded: mode !== 'idb' && mode !== 'loading',
      snapshot,
      syncNow: () => {
        void engine?.trigger()
      },
    }),
    [store, engine, mode, snapshot]
  )

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}
