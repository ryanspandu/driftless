import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Render, type Config, type Data } from '@measured/puck'
import { PanelSelect } from '~/puck/panel-select'
import type { AppSelectOption } from '~/components/ui/app-select'

/**
 * TemplateRef block for the Pages builder — embeds the content of another
 * Template (header/footer/component) inline, composable like a partial.
 *
 * - `TemplateRefField`: a Puck custom field — a dropdown picker listing
 *   reusable templates (HEADER | FOOTER | COMPONENT), fetched from the admin API.
 *   Value is the chosen `templateId`.
 * - `TemplateRefView`: reads the referenced template's content from
 *   `TemplateContext` (SSR/SSG-resolved by the server) and renders it; on CSR /
 *   in the editor it falls back to fetching `/api/public/templates/:id`.
 *
 * Circular-import note: `config.tsx` imports this file, so this file must NOT
 * statically import the config. We load `puckConfig` lazily via a dynamic
 * `import('~/puck/config')` inside an effect.
 */

/**
 * Map of `templateId → Puck content`, resolved server-side for SSR/SSG.
 * Empty in the editor and on CSR pages — there TemplateRefView fetches on the client.
 */
export const TemplateContext = createContext<Record<string, Record<string, unknown>>>({})

interface TemplateMeta {
  id: string
  name: string
  type: string
  isDefault: boolean
}

/** Reusable (non-layout) templates available to reference. */
function useReferenceableTemplates(): TemplateMeta[] {
  const [items, setItems] = useState<TemplateMeta[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/admin/templates', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!alive) return
        const list = Array.isArray(d) ? (d as TemplateMeta[]) : []
        setItems(
          list.filter((t) => t.type === 'HEADER' || t.type === 'FOOTER' || t.type === 'COMPONENT')
        )
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return items
}

export function TemplateRefField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const templates = useReferenceableTemplates()
  const options = useMemo<AppSelectOption[]>(
    () => templates.map((t) => ({ value: t.id, label: `${t.name} (${t.type})` })),
    [templates]
  )
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">Template</span>
      <PanelSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Select template…"
        isClearable
      />
    </label>
  )
}

const notice = 'rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'

export function toData(doc: Record<string, unknown> | undefined | null): Data {
  return doc && Object.keys(doc).length
    ? (doc as unknown as Data)
    : ({ content: [], root: {} } as unknown as Data)
}

/** A doc with no blocks (`undefined`, `{}` or `{ content: [] }`) renders nothing. */
export function hasBlocks(doc: Record<string, unknown> | undefined | null): boolean {
  if (!doc || !Object.keys(doc).length) return false
  const blocks = (doc as { content?: unknown }).content
  return !Array.isArray(blocks) || blocks.length > 0
}

/**
 * The Puck config, handed down by whoever is already holding it.
 *
 * `PublicPageView` imports the config anyway, so on a public page it can simply
 * provide it. That matters for more than tidiness: the dynamic-import fallback
 * below runs in an effect, which never happens during SSR — so a server render
 * emitted the "Loading…" notice in place of every referenced template, and an
 * SSG page baked that notice into its cached HTML. Provided config = the
 * template's blocks are in the initial HTML.
 */
export const PuckConfigContext = createContext<Config | undefined>(undefined)

/**
 * Use the provided config when there is one; otherwise load it lazily (dynamic
 * import) to avoid a static import cycle with `config.tsx`. The config is a
 * module-level singleton, so the fallback resolves immediately after first load
 * — it covers the builder canvas, where no provider is mounted.
 */
export function usePuckConfig(): Config | undefined {
  const provided = useContext(PuckConfigContext)
  const [config, setConfig] = useState<Config>()
  useEffect(() => {
    if (provided) return
    let alive = true
    import('~/puck/config')
      .then((m) => {
        if (alive) setConfig(m.puckConfig)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [provided])
  return provided ?? config
}

export function TemplateRefView({ templateId }: { templateId?: string }) {
  const preloaded = useContext(TemplateContext)
  const fromContext = templateId ? preloaded[templateId] : undefined

  /**
   * The fetched result, tagged with the template it belongs to.
   *
   * Tagged rather than bare so switching templates cannot render the previous
   * one's blocks while the new one loads, and — the actual bug — so "fetched,
   * and it is empty" is distinguishable from "not fetched yet". Keying only on
   * `content` being falsy left an empty template spinning on "Loading…"
   * forever, with nothing to tell the operator the template simply has no
   * blocks in it.
   */
  const [fetched, setFetched] = useState<{
    id: string
    content?: Record<string, unknown>
  } | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const config = usePuckConfig()

  useEffect(() => {
    // Nothing to load, or the server already resolved it — skip the fetch.
    if (!templateId || fromContext) {
      setState('idle')
      return
    }
    let alive = true
    setState('loading')
    fetch(`/api/public/templates/${encodeURIComponent(templateId)}`, {
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
  }, [templateId, fromContext])

  // Only the fetch for *this* template counts; a result left over from the
  // previously selected one is not this block's content.
  const mine = fetched && fetched.id === templateId ? fetched : null
  const resolved = fromContext !== undefined || mine !== null
  const content = fromContext ?? mine?.content

  if (!templateId) return <div className={notice}>Pick a template in the right panel</div>
  if (state === 'error') return <div className={notice}>Could not load template</div>
  if (!resolved || !config) return <div className={notice}>Loading…</div>
  if (!hasBlocks(content)) return <div className={notice}>This template is empty</div>

  return <Render config={config} data={toData(content)} />
}
