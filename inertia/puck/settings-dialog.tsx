import { useState, type ComponentType, type ReactNode } from 'react'
import { createUsePuck } from '@measured/puck'
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
  /** Render no header / no footer at all — distinct from "use the site default". */
  hideHeader: boolean
  hideFooter: boolean
  seo: Record<string, unknown>
  /** ISO timestamps for scheduled publish / unpublish (null = none). */
  scheduledPublishAt?: string | null
  scheduledUnpublishAt?: string | null
}

/** Sentinel for "none" in the header/footer selects. Never sent as an id. */
const NONE = '__none__'

type SectionKey = 'general' | 'seo' | 'page-code' | 'global-code'

const SECTIONS: { key: SectionKey; label: string; icon: ComponentType<{ className?: string }> }[] =
  [
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
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
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
                  active
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
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
  /**
   * Header/footer get a third option. `''` (a null id) has always meant "use
   * the site default"; `NONE` means render none at all, which a sign-in screen
   * or a bare landing page needs. It is a UI sentinel translated into the
   * `hideHeader` / `hideFooter` flags — the id columns carry a foreign key and
   * cannot store it.
   */
  const slotOpts = (list: TemplateSummaryDto[] | undefined, noneLabel: string) => [
    { value: '', label: '— Default —' },
    { value: NONE, label: noneLabel },
    ...(list ?? []).map((t) => ({ value: t.id, label: t.name })),
  ]

  return (
    <SectionBody title="General" description="Page basics, render mode, and template overrides.">
      <Row label="Title" htmlFor="set-title">
        <Input
          id="set-title"
          value={meta.title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </Row>
      <Row
        label="Path"
        htmlFor="set-path"
        hint="URL slug for the public page. Changing it changes the page's URL."
      >
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
            value={meta.hideHeader ? NONE : (meta.headerTemplateId ?? '')}
            onChange={(v) =>
              patch({ headerTemplateId: v === NONE ? null : v || null, hideHeader: v === NONE })
            }
            options={slotOpts(headers.data, '— None (no header) —')}
            placeholder="— Default —"
          />
        </Row>
        <Row label="Footer override" htmlFor="set-footer">
          <AppSelect
            id="set-footer"
            value={meta.hideFooter ? NONE : (meta.footerTemplateId ?? '')}
            onChange={(v) =>
              patch({ footerTemplateId: v === NONE ? null : v || null, hideFooter: v === NONE })
            }
            options={slotOpts(footers.data, '— None (no footer) —')}
            placeholder="— Default —"
          />
        </Row>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t pt-4">
        <Row
          label="Publish at"
          htmlFor="set-sched-pub"
          hint="Auto-publish this draft at a future time (optional)."
        >
          <input
            id="set-sched-pub"
            type="datetime-local"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={toLocalInput(meta.scheduledPublishAt)}
            onChange={(e) => patch({ scheduledPublishAt: fromLocalInput(e.target.value) })}
          />
        </Row>
        <Row
          label="Unpublish at"
          htmlFor="set-sched-unpub"
          hint="Auto-revert to draft at this time (e.g. a promo ends)."
        >
          <input
            id="set-sched-unpub"
            type="datetime-local"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={toLocalInput(meta.scheduledUnpublishAt)}
            onChange={(e) => patch({ scheduledUnpublishAt: fromLocalInput(e.target.value) })}
          />
        </Row>
      </div>

      <p className="text-xs text-muted-foreground">
        Changes apply when you press <strong>Publish</strong>. Scheduled times are checked by a
        background job.
      </p>
    </SectionBody>
  )
}

/** ISO ↔ `datetime-local` (`YYYY-MM-DDTHH:mm`) helpers for the schedule inputs. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── SEO & Meta ─────────────────────────────────────────────────────────────

function SeoSection({ meta, onChange }: { meta: PageMeta; onChange: (m: PageMeta) => void }) {
  const seo = (meta.seo ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof seo[k] === 'string' ? (seo[k] as string) : '')
  const patchSeo = (p: Record<string, unknown>) => onChange({ ...meta, seo: { ...seo, ...p } })
  const metaTags: MetaTag[] = Array.isArray(seo.meta) ? (seo.meta as MetaTag[]) : []

  const effTitle = str('title') || meta.title || 'Untitled page'
  const effDesc = str('description')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const displayUrl = `${origin}/${(meta.path || '').replace(/^\/+/, '')}`.replace(/\/$/, '')

  return (
    <SectionBody title="SEO & Meta" description="Search and social metadata for this page.">
      <SeoPreview title={effTitle} description={effDesc} url={displayUrl} image={str('ogImage')} />

      <Row label="Meta title" htmlFor="seo-title" hint="Falls back to the page title if empty.">
        <Input
          id="seo-title"
          value={str('title')}
          onChange={(e) => patchSeo({ title: e.target.value })}
        />
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

      <JsonLdField value={str('jsonLdCustom')} onChange={(v) => patchSeo({ jsonLdCustom: v })} />

      <p className="text-xs text-muted-foreground">
        Changes apply when you press <strong>Publish</strong>.
      </p>
    </SectionBody>
  )
}

/** Live Google-result + social-card preview for the SEO fields being edited. */
function SeoPreview({
  title,
  description,
  url,
  image,
}: {
  title: string
  description: string
  url: string
  image: string
}) {
  const clampedTitle = title.length > 60 ? `${title.slice(0, 60)}…` : title
  const clampedDesc = description.length > 160 ? `${description.slice(0, 160)}…` : description
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">Search result preview</p>
      <div className="rounded-md bg-background p-3">
        <p className="truncate text-xs text-muted-foreground">{url || 'example.com/page'}</p>
        <p className="text-[15px] leading-snug text-blue-700 dark:text-blue-400">{clampedTitle}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {clampedDesc || 'Add a meta description to control the snippet shown here.'}
        </p>
      </div>
      <p className="text-xs font-medium text-muted-foreground">Social share card</p>
      <div className="overflow-hidden rounded-md border bg-background">
        {image ? (
          <img src={image} alt="" className="aspect-[1.91/1] w-full object-cover" />
        ) : (
          <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            No Open Graph image
          </div>
        )}
        <div className="space-y-0.5 p-2">
          <p className="truncate text-[11px] uppercase text-muted-foreground">
            {(url || 'example.com').replace(/^https?:\/\//, '').split('/')[0]}
          </p>
          <p className="truncate text-sm font-medium">{clampedTitle}</p>
          {clampedDesc ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{clampedDesc}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Custom JSON-LD editor with inline validity feedback. Overrides the auto graph. */
function JsonLdField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const trimmed = value.trim()
  let error: string | null = null
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed)
      if (!parsed || typeof parsed !== 'object') error = 'Must be a JSON object or array.'
    } catch (e) {
      error = e instanceof Error ? e.message : 'Invalid JSON.'
    }
  }
  return (
    <Row
      label="JSON-LD (advanced)"
      htmlFor="seo-jsonld"
      hint="Custom schema.org structured data. Overrides the auto-generated markup. Leave empty to use defaults."
    >
      <div className="space-y-1">
        <Textarea
          id="seo-jsonld"
          rows={5}
          className="font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "FAQPage"\n}'}
        />
        {error ? (
          <p className="text-xs text-destructive">Invalid JSON — {error}</p>
        ) : trimmed ? (
          <p className="text-xs text-green-600 dark:text-green-500">Valid JSON-LD.</p>
        ) : null}
      </div>
    </Row>
  )
}

// ── Page code (local) ──────────────────────────────────────────────────────

/** Selector-scoped store hook — see builder-shell for the rationale. */
const usePuckStore = createUsePuck()

/** Page-local custom CSS / JS — multiple snippets stored on the Puck root props. */
function PageCodeSection() {
  const dispatch = usePuckStore((s) => s.dispatch)
  const root = usePuckStore(
    (s) => (s.appState.data.root ?? {}) as { props?: Record<string, unknown> }
  )
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
          Custom CSS &amp; vanilla JS for <strong>this page only</strong> — not site-wide. JS runs
          on the live published page, never in the editor.
        </>
      }
    />
  )
}
