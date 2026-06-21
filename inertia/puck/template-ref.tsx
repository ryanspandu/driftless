import { createContext, useContext, useEffect, useState } from 'react'
import { Render, type Config, type Data } from '@measured/puck'

/**
 * TemplateRef block for the Pages builder — embeds the content of another
 * Template (header/footer/component) inline, composable like a partial.
 *
 * - `TemplateRefField`: a Puck custom field — a `<select>` picker listing
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

const inputCls =
  'w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

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
        setItems(list.filter((t) => t.type === 'HEADER' || t.type === 'FOOTER' || t.type === 'COMPONENT'))
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
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">Template</span>
      <select
        className={inputCls}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select template…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.type})
          </option>
        ))}
      </select>
    </label>
  )
}

const notice = 'rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'

function toData(doc: Record<string, unknown> | undefined | null): Data {
  return doc && Object.keys(doc).length
    ? (doc as unknown as Data)
    : ({ content: [], root: {} } as unknown as Data)
}

/**
 * Load the Puck config lazily (dynamic import) to avoid a static import cycle
 * with `config.tsx`. The config is module-level singleton, so this resolves
 * immediately after the first load.
 */
function usePuckConfig(): Config | undefined {
  const [config, setConfig] = useState<Config>()
  useEffect(() => {
    let alive = true
    import('~/puck/config')
      .then((m) => {
        if (alive) setConfig(m.puckConfig)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return config
}

export function TemplateRefView({ templateId }: { templateId?: string }) {
  const preloaded = useContext(TemplateContext)
  const fromContext = templateId ? preloaded[templateId] : undefined

  const [content, setContent] = useState<Record<string, unknown> | undefined>(fromContext)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const config = usePuckConfig()

  useEffect(() => {
    if (!templateId) {
      setContent(undefined)
      setState('idle')
      return
    }
    // Server-resolved content already present — use it, skip the client fetch.
    if (fromContext) {
      setContent(fromContext)
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
          setContent(d.content ?? undefined)
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

  if (!templateId) return <div className={notice}>Pick a template in the right panel</div>
  if (!content) {
    if (state === 'error') return <div className={notice}>Could not load template</div>
    return <div className={notice}>Loading…</div>
  }
  if (!config) return <div className={notice}>Loading…</div>

  return <Render config={config} data={toData(content)} />
}
