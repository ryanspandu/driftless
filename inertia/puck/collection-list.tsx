import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { Render } from '@measured/puck'
import { RecordContext } from '~/puck/record-binding'
import { TemplateContext, hasBlocks, toData, usePuckConfig } from '~/puck/template-ref'
import { PanelSelect } from '~/puck/panel-select'
import type { AppSelectGroup, AppSelectOption } from '~/components/ui/app-select'

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

export interface CollectionMeta {
  key: string
  label: string
  /** Picker heading: "Content" / "E-commerce" for built-ins, null for CMS collections. */
  group?: string | null
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

/**
 * The server-side query a CollectionList runs, derived from its block props.
 *
 * Filter/sort/pagination all run on the server now (only one page of rows ever
 * reaches the browser). This builder and `cacheKey` below are MIRRORED — by
 * copy, not import — in `app/services/page_data_resolver.ts`, which preloads
 * page 1 for SSR under the exact same key. If the two normalise differently the
 * server-resolved page is never found and the client re-fetches it. Change both
 * together.
 */
export interface CollectionQuery {
  key: string
  pageSize: number
  sortField: string
  sortDir: 'asc' | 'desc'
  filterField: string
  filterValue: string
}

export function collectionQuery(
  source: CollectionSource | undefined,
  props: {
    limit?: unknown
    pageSize?: unknown
    sort?: unknown
    filterField?: unknown
    filterValue?: unknown
  }
): CollectionQuery {
  const key = source?.collectionKey ?? ''
  const perPage = Number(props.pageSize) || 0
  const pageSize = perPage > 0 ? perPage : Number(props.limit) || 12
  const titleField = source?.titleField
  const sort = String(props.sort ?? 'newest')
  let sortField = 'created_at'
  let sortDir: 'asc' | 'desc' = 'desc'
  if (sort === 'oldest') sortDir = 'asc'
  else if (sort === 'title-asc' && titleField) {
    sortField = titleField
    sortDir = 'asc'
  } else if (sort === 'title-desc' && titleField) {
    sortField = titleField
    sortDir = 'desc'
  }
  const filterField = String(props.filterField ?? '').trim()
  const filterValue = String(props.filterValue ?? '').trim()
  return { key, pageSize, sortField, sortDir, filterField, filterValue }
}

export function collectionCacheKey(q: CollectionQuery, page: number): string {
  return `${q.key}|${page}|${q.pageSize}|${q.sortField}|${q.sortDir}|${q.filterField}|${q.filterValue}`
}

function collectionQueryString(q: CollectionQuery, page: number): string {
  const p = new URLSearchParams({
    limit: String(q.pageSize),
    page: String(page),
    sortField: q.sortField,
    sortDir: q.sortDir,
  })
  if (q.filterField && q.filterValue) {
    p.set('filterField', q.filterField)
    p.set('filterValue', q.filterValue)
  }
  return p.toString()
}

export function useCollections(): CollectionMeta[] {
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

/**
 * One "map a collection field to this slot" select.
 *
 * Declared at module scope on purpose. Nested inside `CollectionSourceField` it
 * was a *new component type* on every render, so React unmounted and remounted
 * every select on each keystroke — the open dropdown closed and focus jumped
 * the moment anything changed.
 */
function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: CollectionMeta['fields']
  onChange: (value: string) => void
}) {
  const opts = useMemo<AppSelectOption[]>(
    () => options.map((f) => ({ value: f.key, label: `${f.label} (${f.key})` })),
    [options]
  )
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <PanelSelect value={value} onChange={onChange} options={opts} placeholder="—" isClearable />
    </label>
  )
}

/**
 * Picker groups, in server order: built-ins carry their own heading (Content,
 * E-commerce); dynamic CMS collections share one.
 */
function groupCollections(cols: CollectionMeta[]): AppSelectGroup[] {
  const groups = new Map<string, AppSelectOption[]>()
  for (const c of cols) {
    const g = c.group || 'CMS collections'
    const list = groups.get(g) ?? []
    list.push({ value: c.key, label: c.label })
    groups.set(g, list)
  }
  return [...groups.entries()].map(([label, options]) => ({ label, options }))
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
  const collectionOptions = useMemo(() => groupCollections(cols), [cols])

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Collection</span>
        <PanelSelect
          value={v.collectionKey}
          // Replaces the whole source: field mappings belong to the old collection.
          onChange={(key) => onChange({ collectionKey: key })}
          options={collectionOptions}
          placeholder="Select collection…"
          isClearable
        />
      </label>

      {v.collectionKey ? (
        <div className="grid grid-cols-2 gap-2">
          <FieldSelect
            label="Title field"
            value={v.titleField}
            options={fieldOptions}
            onChange={(titleField) => set({ titleField })}
          />
          <FieldSelect
            label="Excerpt field"
            value={v.excerptField}
            options={fieldOptions}
            onChange={(excerptField) => set({ excerptField })}
          />
          <FieldSelect
            label="Image field"
            value={v.imageField}
            options={fieldOptions}
            onChange={(imageField) => set({ imageField })}
          />
          <FieldSelect
            label="Link field"
            value={v.linkField}
            options={fieldOptions}
            onChange={(linkField) => set({ linkField })}
          />
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

/**
 * Fetch one server-shaped page. Page 1 is served from the SSR preload when
 * present (keyed identically to the server); other pages fetch on the client.
 */
export function useRecords(q: CollectionQuery, page: number) {
  const preloadMap = useContext(CollectionDataContext)
  const preloaded = q.key && page === 1 ? preloadMap[collectionCacheKey(q, 1)] : undefined
  const [records, setRecords] = useState<CmsRecord[]>(preloaded ?? [])
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    if (!q.key) {
      setRecords([])
      setState('idle')
      return
    }
    if (preloaded) {
      setRecords(preloaded)
      setState('idle')
      return
    }
    let alive = true
    setState('loading')
    fetch(
      `/api/public/cms/${encodeURIComponent(q.key)}/records?${collectionQueryString(q, page)}`,
      {
        headers: { Accept: 'application/json' },
      }
    )
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
    // preloaded is derived from (q, page); listing it would double-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionCacheKey(q, page)])

  return { records, state }
}

/**
 * The COLLECTION template a list repeats, loaded once for the whole list.
 *
 * Same resolution order as `TemplateRefView`: the SSR preload in
 * `TemplateContext` first, else one fetch. Fetching here rather than per item
 * is what keeps a 12-record list at one request instead of twelve.
 *
 * In the builder the template is fetched from the admin endpoint: the public
 * one refuses a template no published page references yet, and a freshly
 * created card is exactly that. Live pages use the public endpoint as usual.
 */
function useCollectionTemplate(templateId: string | undefined, editing: boolean) {
  const preloaded = useContext(TemplateContext)
  const fromContext = templateId ? preloaded[templateId] : undefined
  const [fetched, setFetched] = useState<{
    id: string
    content?: Record<string, unknown>
  } | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    if (!templateId || fromContext) {
      setState('idle')
      return
    }
    let alive = true
    setState('loading')
    const id = encodeURIComponent(templateId)
    fetch(editing ? `/api/admin/templates/${id}` : `/api/public/templates/${id}`, {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d: { content?: Record<string, unknown> }) => {
        if (alive) {
          setFetched({ id: templateId, content: d.content ?? undefined })
          setState('idle')
        }
      })
      .catch(() => {
        if (alive) setState('error')
      })
    return () => {
      alive = false
    }
  }, [templateId, fromContext, editing])

  const mine = fetched && fetched.id === templateId ? fetched : null
  return {
    content: fromContext ?? mine?.content,
    resolved: fromContext !== undefined || mine !== null,
    state,
  }
}

/** Every record's binding namespace: its data plus `id` and `createdAt`. */
function recordFields(rec: CmsRecord): Record<string, unknown> {
  return { id: rec.id, createdAt: rec.createdAt, ...rec.data }
}

function recordString(record: CmsRecord, key: string | undefined): string | undefined {
  if (!key) return undefined
  const raw = record.data[key]
  return typeof raw === 'string' ? raw : undefined
}

const notice = 'rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'

/** Puck stores radio booleans as the strings 'true'/'false'. */
function bool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null || v === '') return fallback
  return String(v) === 'true'
}

const ASPECT_CLASS: Record<string, string> = {
  video: 'aspect-video',
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
  auto: '',
}

export function CollectionList({
  source,
  limit,
  columns,
  layout,
  cardStyle,
  gap,
  imageAspect,
  showImage,
  showTitle,
  showExcerpt,
  sort,
  filterField,
  filterValue,
  pageSize,
  template,
  templateId,
  ItemSlot,
  EmptySlot,
  editing = false,
}: {
  source?: CollectionSource
  limit?: number
  columns?: string | number
  layout?: string
  cardStyle?: string
  gap?: string | number
  imageAspect?: string
  showImage?: string
  showTitle?: string
  showExcerpt?: string
  sort?: string
  filterField?: string
  filterValue?: string
  pageSize?: string | number
  /**
   * 'template' repeats a COLLECTION template per record, 'custom' the designed
   * item slot; 'card' (legacy, no longer offered) the built-in card.
   */
  template?: string
  /** The COLLECTION template to repeat when `template === 'template'`. */
  templateId?: string
  /** The Puck-injected item slot component (the designed template). */
  ItemSlot?: ComponentType
  /** The Puck-injected empty-state slot (shown when there are no records). */
  EmptySlot?: ComponentType
  /** True inside the builder canvas. */
  editing?: boolean
}) {
  // Forgive `source` given as a bare collection key string (a natural mistake
  // for API/AI callers) — the real shape is `{ collectionKey }`.
  const src: CollectionSource =
    typeof source === 'string' ? { collectionKey: source } : (source ?? {})
  // The server does all filtering/sorting/paging; the browser only ever holds
  // one page of records (this is the scalability fix).
  const q = collectionQuery(src, { limit, pageSize, sort, filterField, filterValue })
  const [page, setPage] = useState(1)
  const { records, state } = useRecords(q, page)
  const cols = Number(columns) || 3
  const gapPx = Number(gap)
  const isList = layout === 'list'
  const style = cardStyle || 'card'
  const aspect = ASPECT_CLASS[imageAspect ?? 'video'] ?? 'aspect-video'
  const withImage = bool(showImage)
  const withTitle = bool(showTitle)
  const withExcerpt = bool(showExcerpt)

  // Pagination is on when the block sets an explicit per-page size. Without an
  // exact total we page with a "full page ⇒ maybe more" heuristic (Prev/Next).
  const paginated = Number(pageSize) > 0
  const hasMore = paginated && records.length >= q.pageSize
  const visible = records
  const isCustom = template === 'custom' && !!ItemSlot
  const isTemplate = template === 'template'

  // Hooks stay unconditional: the template loads only when there is an id.
  const tpl = useCollectionTemplate(isTemplate ? templateId || undefined : undefined, editing)
  const config = usePuckConfig()
  // What one repeated item is — the designed slot or the shared template.
  // `null` while the template is unset/loading; the branches below explain why.
  const renderItem: (() => ReactNode) | null = isCustom
    ? () => <ItemSlot />
    : isTemplate && tpl.content && config && hasBlocks(tpl.content)
      ? () => <Render config={config} data={toData(tpl.content)} />
      : null

  const templateNotice = (() => {
    if (!isTemplate) return null
    if (!templateId)
      return editing
        ? 'Pick a collection template in the right panel, or create one'
        : 'No collection template selected'
    if (tpl.state === 'error') return 'Could not load the collection template'
    if (!tpl.resolved || !config) return 'Loading…'
    if (!hasBlocks(tpl.content)) return 'This collection template is empty — design it in Templates'
    return null
  })()

  // Editor: preview the real repeat — the designed item rendered once per
  // fetched record, so the canvas matches the live page. Every instance renders
  // the SAME template, so editing any of them edits the shared design (exactly
  // like Webflow). Bound fields resolve against each record's own data.
  if (isTemplate && editing && (!src.collectionKey || templateNotice)) {
    return (
      <div className={notice}>
        {!src.collectionKey ? 'Select a collection in the right panel' : templateNotice}
      </div>
    )
  }
  if ((isCustom || isTemplate) && editing && renderItem) {
    const previewRecs = records.length ? records : [null]
    const editorContainer = isList
      ? {
          display: 'flex',
          flexDirection: 'column' as const,
          gap: `${Number.isFinite(gapPx) ? gapPx : 16}px`,
        }
      : {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: `${Number.isFinite(gapPx) ? gapPx : 20}px`,
        }
    return (
      <div>
        <div className="mb-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Previewing {previewRecs.length === 1 && !records.length ? 'a sample' : previewRecs.length}{' '}
          record{previewRecs.length === 1 ? '' : 's'}
          {isTemplate ? (
            <>
              {' '}
              — the collection template repeats per record. Edit its design in{' '}
              <a
                href={`/admin/templates/${encodeURIComponent(templateId ?? '')}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                Templates
              </a>
              .
            </>
          ) : (
            <>
              {' '}
              — editing any card edits the shared template. Select a Text, Heading, Button or Image
              and open its <span className="font-medium">Settings</span> tab to bind it to a field.
            </>
          )}
        </div>
        <div style={editorContainer}>
          {previewRecs.map((rec, i) => (
            <RecordContext.Provider
              key={rec?.id ?? i}
              value={{ fields: rec ? recordFields(rec) : {}, editing: true }}
            >
              {renderItem()}
            </RecordContext.Provider>
          ))}
        </div>
        {EmptySlot ? (
          <div className="mt-4 rounded-md border border-dashed p-2">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Empty state (shown when no records)
            </p>
            <EmptySlot />
          </div>
        ) : null}
      </div>
    )
  }

  if (!src.collectionKey)
    // Editor-only hint — never leak the "right panel" prompt onto a public page.
    return editing ? <div className={notice}>Select a collection in the right panel</div> : null
  if (state === 'loading' && !records.length) return <div className={notice}>Loading…</div>
  if (state === 'error') return <div className={notice}>Could not load records</div>
  if (templateNotice) return <div className={notice}>{templateNotice}</div>
  if (!records.length) {
    // Designed lists render the author's empty state (Webflow-style).
    if ((isCustom || isTemplate) && EmptySlot) return <EmptySlot />
    if (q.filterField && q.filterValue)
      return <div className={notice}>No records match this filter</div>
    return <div className={notice}>No published records</div>
  }

  const containerStyle = isList
    ? {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: `${Number.isFinite(gapPx) ? gapPx : 16}px`,
      }
    : {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${Number.isFinite(gapPx) ? gapPx : 20}px`,
      }

  const pager =
    paginated && (page > 1 || hasMore) ? (
      <nav className="mt-6 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-md border px-3 py-1.5 disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-muted-foreground">Page {page}</span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          className="rounded-md border px-3 py-1.5 disabled:opacity-40"
        >
          Next
        </button>
      </nav>
    ) : null

  // Published designed list: repeat the item (slot or collection template) once
  // per record, each wrapped in its own field context so token-aware blocks
  // resolve per record.
  if (renderItem) {
    return (
      <div>
        <div style={containerStyle}>
          {visible.map((rec) => (
            <RecordContext.Provider
              key={rec.id}
              value={{ fields: recordFields(rec), editing: false }}
            >
              {renderItem()}
            </RecordContext.Provider>
          ))}
        </div>
        {pager}
      </div>
    )
  }

  return (
    <div>
      <div style={containerStyle}>
        {visible.map((rec) => {
          // Fall back to conventional field names when the source didn't map them
          // (e.g. a `source` given as just a collection key) — otherwise the
          // default card renders blank even though records loaded.
          const title = recordString(rec, src.titleField ?? 'title')
          const excerpt = recordString(rec, src.excerptField ?? 'excerpt')
          const image = withImage ? recordString(rec, src.imageField ?? 'image') : undefined
          const linkValue = recordString(rec, src.linkField)
          const href = linkValue ? `${src.linkBase ?? ''}${linkValue}` : undefined

          const overlay = style === 'overlay' && image
          const wrapCls =
            style === 'card'
              ? 'h-full overflow-hidden rounded-lg border bg-card text-card-foreground'
              : style === 'overlay'
                ? 'relative h-full overflow-hidden rounded-lg text-white'
                : 'h-full'

          const imgEl = image ? (
            <img
              src={image}
              alt={title ?? ''}
              loading="lazy"
              decoding="async"
              className={
                overlay ? 'h-full w-full object-cover' : `w-full object-cover ${aspect}`.trim()
              }
            />
          ) : null

          const textEl = (
            <div
              className={
                overlay
                  ? 'absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4'
                  : isList
                    ? 'min-w-0 flex-1 space-y-1.5 py-1'
                    : `space-y-1.5 ${style === 'card' ? 'p-4' : 'pt-3'}`
              }
            >
              {withTitle && title ? <h3 className="font-semibold leading-snug">{title}</h3> : null}
              {withExcerpt && excerpt ? (
                <p
                  className={
                    overlay
                      ? 'line-clamp-2 text-sm text-white/80'
                      : 'line-clamp-3 text-sm text-muted-foreground'
                  }
                >
                  {excerpt}
                </p>
              ) : null}
            </div>
          )

          // List rows put the image beside the text; grid stacks them.
          const inner =
            isList && !overlay ? (
              <div className={`flex gap-4 ${style === 'card' ? 'p-4' : ''}`.trim()}>
                {image ? (
                  <img
                    src={image}
                    alt={title ?? ''}
                    loading="lazy"
                    decoding="async"
                    className={`w-40 shrink-0 rounded-md object-cover ${aspect || 'aspect-video'}`}
                  />
                ) : null}
                {textEl}
              </div>
            ) : (
              <>
                {imgEl}
                {textEl}
              </>
            )

          const card = <div className={wrapCls}>{inner}</div>

          return href ? (
            <a key={rec.id} href={href} className="block no-underline">
              {card}
            </a>
          ) : (
            <div key={rec.id}>{card}</div>
          )
        })}
      </div>

      {pager}
    </div>
  )
}
