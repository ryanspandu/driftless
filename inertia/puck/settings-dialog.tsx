import { useState, type ComponentType, type ReactNode } from 'react'
import { usePuck } from '@measured/puck'
import { Code2, Globe, Search, Settings2 } from 'lucide-react'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { AppSelect } from '~/components/ui/app-select'
import { useTemplatesList } from '~/hooks/api/use-templates'
import { MetaTagsEditor, type MetaTag } from '~/components/admin/meta-tags-editor'
import type { ContentStatus, PageRenderMode, TemplateSummaryDto } from '~/types/api'
import { cn } from '~/lib/utils'
import { MediaField } from './media-field'
import { readSnippets, type CodeSnippet } from './custom-code'
import { SnippetManager } from './snippet-manager'
import { GlobalCodePanel } from './global-code-panel'

/**
 * Page Settings — a sectioned panel reached from the builder navbar gear.
 *
 * Section data lives in different places:
 *   • General / SEO & Meta → page-level fields (`PageMeta`) lifted to the builder
 *     page and persisted on Publish (this file just edits the in-memory copy).
 *   • Page code (local)    → the page's Puck `root.props.codeSnippets`.
 *   • Global code (site)   → `web_settings` via `GlobalCodePanel` (explicit Save).
 *
 * The code sections are **list-first**: opening the dialog shows the snippet list;
 * the code editor only appears when you Add or open one.
 */

/** Page-level settings edited here, persisted with the page on Publish. */
export interface PageMeta {
  title: string
  path: string
  status: ContentStatus
  renderMode: PageRenderMode
  layoutId: string | null
  headerTemplateId: string | null
  footerTemplateId: string | null
  seo: Record<string, unknown>
}

type SectionKey = 'general' | 'seo' | 'page-code' | 'global-code'

const SECTIONS: { key: SectionKey; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'seo', label: 'SEO & Meta', icon: Search },
  { key: 'page-code', label: 'Page code', icon: Code2 },
  { key: 'global-code', label: 'Global code', icon: Globe },
]

export function SettingsDialog({
  open,
  onOpenChange,
  pageMeta,
  onPageMetaChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Page-level settings — omitted for the Templates builder (no title/SEO). */
  pageMeta?: PageMeta
  onPageMetaChange?: (meta: PageMeta) => void
}) {
  // Templates have no page meta → only the code sections apply to them.
  const canEditMeta = Boolean(pageMeta && onPageMetaChange)
  const availableSections = canEditMeta
    ? SECTIONS
    : SECTIONS.filter((s) => s.key === 'page-code' || s.key === 'global-code')
  const [section, setSection] = useState<SectionKey>(canEditMeta ? 'general' : 'page-code')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 flex h-[640px] max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left nav */}
        <nav className="flex w-52 shrink-0 flex-col gap-0.5 border-r bg-muted/30 p-3">
          <div className="px-2 pb-2 text-sm font-semibold">Page settings</div>
          {availableSections.map((s) => {
            const Icon = s.icon
            const active = section === s.key
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  active ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {s.label}
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {section === 'general' && pageMeta && onPageMetaChange ? (
            <GeneralSection meta={pageMeta} onChange={onPageMetaChange} />
          ) : section === 'seo' && pageMeta && onPageMetaChange ? (
            <SeoSection meta={pageMeta} onChange={onPageMetaChange} />
          ) : section === 'page-code' ? (
            <PageCodeSection />
          ) : (
            <GlobalCodePanel />
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="text-lg leading-none">×</span>
        </button>
      </div>
    </div>
  )
}

/** Scrollable section frame: sticky title/description header + padded body. */
function SectionBody({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b p-4 pr-12">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
    </div>
  )
}

function Row({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

// ── General ────────────────────────────────────────────────────────────────

function GeneralSection({ meta, onChange }: { meta: PageMeta; onChange: (m: PageMeta) => void }) {
  const patch = (p: Partial<PageMeta>) => onChange({ ...meta, ...p })
  const layouts = useTemplatesList('LAYOUT')
  const headers = useTemplatesList('HEADER')
  const footers = useTemplatesList('FOOTER')
  const opts = (list?: TemplateSummaryDto[]) => [
    { value: '', label: '— Default —' },
    ...(list ?? []).map((t) => ({ value: t.id, label: t.name })),
  ]

  return (
    <SectionBody title="General" description="Page basics, render mode, and template overrides.">
      <Row label="Title" htmlFor="set-title">
        <Input id="set-title" value={meta.title} onChange={(e) => patch({ title: e.target.value })} />
      </Row>
      <Row label="Path" htmlFor="set-path" hint="URL slug for the public page. Changing it changes the page's URL.">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">/</span>
          <Input
            id="set-path"
            value={meta.path}
            onChange={(e) => patch({ path: e.target.value })}
            placeholder="about/team"
          />
        </div>
      </Row>
      <div className="grid grid-cols-2 gap-4">
        <Row label="Status" htmlFor="set-status">
          <AppSelect
            id="set-status"
            value={meta.status}
            onChange={(v) => patch({ status: v as ContentStatus })}
            options={[
              { value: 'DRAFT', label: 'Draft' },
              { value: 'PUBLISHED', label: 'Published' },
            ]}
            isSearchable={false}
          />
        </Row>
        <Row label="Render mode" htmlFor="set-render">
          <AppSelect
            id="set-render"
            value={meta.renderMode}
            onChange={(v) => patch({ renderMode: v as PageRenderMode })}
            options={[
              { value: 'SSR', label: 'SSR (server-rendered)' },
              { value: 'SSG', label: 'Static (cached)' },
              { value: 'CSR', label: 'PWA (client)' },
            ]}
            isSearchable={false}
          />
        </Row>
      </div>
      <Row label="Layout" htmlFor="set-layout">
        <AppSelect
          id="set-layout"
          value={meta.layoutId ?? ''}
          onChange={(v) => patch({ layoutId: v || null })}
          options={opts(layouts.data)}
          placeholder="— Default —"
        />
      </Row>
      <div className="grid grid-cols-2 gap-4">
        <Row label="Header override" htmlFor="set-header">
          <AppSelect
            id="set-header"
            value={meta.headerTemplateId ?? ''}
            onChange={(v) => patch({ headerTemplateId: v || null })}
            options={opts(headers.data)}
            placeholder="— Default —"
          />
        </Row>
        <Row label="Footer override" htmlFor="set-footer">
          <AppSelect
            id="set-footer"
            value={meta.footerTemplateId ?? ''}
            onChange={(v) => patch({ footerTemplateId: v || null })}
            options={opts(footers.data)}
            placeholder="— Default —"
          />
        </Row>
      </div>
      <p className="text-xs text-muted-foreground">
        Changes apply when you press <strong>Publish</strong>.
      </p>
    </SectionBody>
  )
}

// ── SEO & Meta ─────────────────────────────────────────────────────────────

function SeoSection({ meta, onChange }: { meta: PageMeta; onChange: (m: PageMeta) => void }) {
  const seo = (meta.seo ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof seo[k] === 'string' ? (seo[k] as string) : '')
  const patchSeo = (p: Record<string, unknown>) => onChange({ ...meta, seo: { ...seo, ...p } })
  const metaTags: MetaTag[] = Array.isArray(seo.meta) ? (seo.meta as MetaTag[]) : []

  return (
    <SectionBody title="SEO & Meta" description="Search and social metadata for this page.">
      <Row label="Meta title" htmlFor="seo-title" hint="Falls back to the page title if empty.">
        <Input id="seo-title" value={str('title')} onChange={(e) => patchSeo({ title: e.target.value })} />
      </Row>
      <Row label="Meta description" htmlFor="seo-desc">
        <Textarea
          id="seo-desc"
          rows={3}
          value={str('description')}
          onChange={(e) => patchSeo({ description: e.target.value })}
        />
      </Row>
      <Row label="Open Graph image">
        <MediaField value={str('ogImage')} onChange={(url) => patchSeo({ ogImage: url })} />
      </Row>
      <Row label="Canonical URL" htmlFor="seo-canonical">
        <Input
          id="seo-canonical"
          value={str('canonical')}
          onChange={(e) => patchSeo({ canonical: e.target.value })}
          placeholder="https://example.com/page"
        />
      </Row>
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <span>
          <span className="block text-sm font-medium">No-index</span>
          <span className="block text-xs text-muted-foreground">
            Ask search engines not to index this page.
          </span>
        </span>
        <Switch checked={seo.noindex === true} onCheckedChange={(v) => patchSeo({ noindex: v })} />
      </label>

      <MetaTagsEditor tags={metaTags} onChange={(next) => patchSeo({ meta: next })} />

      <p className="text-xs text-muted-foreground">
        Changes apply when you press <strong>Publish</strong>.
      </p>
    </SectionBody>
  )
}

// ── Page code (local) ──────────────────────────────────────────────────────

/** Page-local custom CSS / JS — multiple snippets stored on the Puck root props. */
function PageCodeSection() {
  const { appState, dispatch } = usePuck()
  const root = (appState.data.root ?? {}) as { props?: Record<string, unknown> }
  const rootProps: Record<string, unknown> = root.props ?? {}
  const snippets = readSnippets(rootProps)

  const persist = (next: CodeSnippet[]) => {
    // Write the array shape and drop the legacy single-string props it replaces.
    const props: Record<string, unknown> = { ...rootProps, codeSnippets: next }
    delete props.customCss
    delete props.customJs
    dispatch({ type: 'replaceRoot', root: { ...root, props }, recordHistory: false })
  }

  return (
    <SnippetManager
      snippets={snippets}
      onChange={persist}
      title="Page code"
      description={
        <>
          Custom CSS &amp; vanilla JS for <strong>this page only</strong> — not site-wide. JS runs on
          the live published page, never in the editor.
        </>
      }
    />
  )
}
