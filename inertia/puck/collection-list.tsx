import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Collection binding for the Pages builder (Webflow-style Collection List).
 *
 * - `CollectionSourceField`: a Puck custom field — pick a collection + map its
 *   fields to title/excerpt/image/link (options fetched from the builder API).
 * - `CollectionList`: renders a live grid of PUBLISHED records, fetched from the
 *   public collections API. Runs in both the editor preview and the public page.
 */

export interface CollectionSource {
  collectionKey?: string
  titleField?: string
  excerptField?: string
  imageField?: string
  linkField?: string
  linkBase?: string
}

interface CollectionMeta {
  key: string
  label: string
  fields: { key: string; label: string; type: string }[]
}

export interface CmsRecord {
  id: string
  status: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/**
 * Records resolved server-side for SSR/SSG, keyed by `${collectionKey}:${limit}`.
 * Empty in the editor and on CSR pages — there CollectionList fetches on the client.
 */
export const CollectionDataContext = createContext<Record<string, CmsRecord[]>>({})

const inputCls =
  'w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

function useCollections(): CollectionMeta[] {
  const [cols, setCols] = useState<CollectionMeta[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/admin/pages/collections', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (alive) setCols(Array.isArray(d) ? (d as CollectionMeta[]) : [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return cols
}

export function CollectionSourceField({
  value,
  onChange,
}: {
  value?: CollectionSource
  onChange: (value: CollectionSource) => void
}) {
  const cols = useCollections()
  const v: CollectionSource = value ?? {}
  const current = cols.find((c) => c.key === v.collectionKey)
  const fieldOptions = current?.fields ?? []
  const set = (patch: Partial<CollectionSource>) => onChange({ ...v, ...patch })

  function FieldSelect({ label, prop }: { label: string; prop: keyof CollectionSource }) {
    return (
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <select
          className={inputCls}
          value={(v[prop] as string) ?? ''}
          onChange={(e) => set({ [prop]: e.target.value } as Partial<CollectionSource>)}
        >
          <option value="">—</option>
          {fieldOptions.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} ({f.key})
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Collection</span>
        <select
          className={inputCls}
          value={v.collectionKey ?? ''}
          onChange={(e) => onChange({ collectionKey: e.target.value })}
        >
          <option value="">Select collection…</option>
          {cols.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      {v.collectionKey ? (
        <div className="grid grid-cols-2 gap-2">
          <FieldSelect label="Title field" prop="titleField" />
          <FieldSelect label="Excerpt field" prop="excerptField" />
          <FieldSelect label="Image field" prop="imageField" />
          <FieldSelect label="Link field" prop="linkField" />
          <label className="col-span-2 block space-y-1">
            <span className="text-xs text-muted-foreground">Link base (prefix)</span>
            <input
              className={inputCls}
              value={v.linkBase ?? ''}
              placeholder="/blog/"
              onChange={(e) => set({ linkBase: e.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

function useRecords(collectionKey: string | undefined, limit: number | undefined) {
  const preloadMap = useContext(CollectionDataContext)
  const preloaded = collectionKey ? preloadMap[`${collectionKey}:${limit ?? 12}`] : undefined
  const [records, setRecords] = useState<CmsRecord[]>(preloaded ?? [])
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    if (!collectionKey) {
      setRecords([])
      setState('idle')
      return
    }
    // SSR/SSG-resolved data already present — use it, skip the client fetch.
    if (preloaded) {
      setRecords(preloaded)
      setState('idle')
      return
    }
    let alive = true
    setState('loading')
    fetch(`/api/public/cms/${encodeURIComponent(collectionKey)}/records?limit=${limit ?? 12}`, {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: { items?: CmsRecord[] }) => {
        if (alive) {
          setRecords(Array.isArray(d.items) ? d.items : [])
          setState('idle')
        }
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [collectionKey, limit, preloaded])

  return { records, state }
}

function recordString(record: CmsRecord, key: string | undefined): string | undefined {
  if (!key) return undefined
  const raw = record.data[key]
  return typeof raw === 'string' ? raw : undefined
}

const notice = 'rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'

export function CollectionList({
  source,
  limit,
  columns,
}: {
  source?: CollectionSource
  limit?: number
  columns?: string | number
}) {
  const src: CollectionSource = source ?? {}
  const { records, state } = useRecords(src.collectionKey, limit)
  const cols = Number(columns) || 3

  if (!src.collectionKey) return <div className={notice}>Select a collection in the right panel</div>
  if (state === 'loading') return <div className={notice}>Loading…</div>
  if (state === 'error') return <div className={notice}>Could not load records</div>
  if (!records.length) return <div className={notice}>No published records</div>

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '20px',
      }}
    >
      {records.map((rec) => {
        const title = recordString(rec, src.titleField)
        const excerpt = recordString(rec, src.excerptField)
        const image = recordString(rec, src.imageField)
        const linkValue = recordString(rec, src.linkField)
        const href = linkValue ? `${src.linkBase ?? ''}${linkValue}` : undefined

        const card = (
          <div className="h-full overflow-hidden rounded-lg border bg-card text-card-foreground">
            {image ? (
              <img src={image} alt={title ?? ''} className="aspect-video w-full object-cover" />
            ) : null}
            <div className="space-y-1.5 p-4">
              {title ? <h3 className="font-semibold leading-snug">{title}</h3> : null}
              {excerpt ? <p className="line-clamp-3 text-sm text-muted-foreground">{excerpt}</p> : null}
            </div>
          </div>
        )

        return href ? (
          <a key={rec.id} href={href} className="block no-underline">
            {card}
          </a>
        ) : (
          <div key={rec.id}>{card}</div>
        )
      })}
    </div>
  )
}
