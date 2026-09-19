import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { PageSummaryDto, PageRenderMode, PageKind } from '~/types/api'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { AppSelect, type AppSelectOption } from '~/components/ui/app-select'
import { apiErrorMessage } from '~/lib/api'
import { useTemplatesList } from '~/hooks/api/use-templates'
import {
  useCodeComponents,
  useCustomTemplates,
  useCodeTemplates,
  usePage,
} from '~/hooks/api/use-pages'
import { MetaTagsEditor, type MetaTag } from '~/components/admin/meta-tags-editor'
import { MediaField, isImageMime } from '~/puck/media-field'
import { SeoPreview } from '~/puck/settings-dialog'
import { cn } from '~/lib/utils'

type Mode = { kind: 'create' } | { kind: 'edit'; row: PageSummaryDto }

/**
 * How the operator is building this page — a UI-only choice, wider than the
 * stored `kind`. `BUILDER` and `CODE` map to the same-named `kind`; `KIT` (a
 * custom-template folder) is also stored as `kind='CODE'`, distinguished by a
 * `component = "kit:<id>"` value. The two code choices differ only in which
 * picker + hint they show and how `component` is shaped on submit.
 */
type BuildWith = 'BUILDER' | 'CODE' | 'KIT'
const KIT_PREFIX = 'kit:'
const CODETPL_PREFIX = 'codetpl:'

/**
 * A Header/Footer/Layout select value is one of: a builder-template id, a
 * `codetpl:<kit>/<type>` code pointer, `''` (site default) or `NONE`. This
 * splits it into the two columns — the FK id vs. the code pointer.
 */
function splitChrome(value: string): { templateId: string | null; code: string | null } {
  if (value.startsWith(CODETPL_PREFIX)) return { templateId: null, code: value }
  return { templateId: value || null, code: null }
}

export type PageFormSubmit = (values: {
  title: string
  path: string
  status: 'DRAFT' | 'PUBLISHED'
  renderMode: PageRenderMode
  kind: PageKind
  component: string | null
  layoutId: string | null
  headerTemplateId: string | null
  footerTemplateId: string | null
  codeHeader: string | null
  codeFooter: string | null
  codeLayout: string | null
  hideHeader: boolean
  hideFooter: boolean
  /** Only sent when the dialog shows the SEO section (edit mode, CODE/KIT pages). */
  seo?: Record<string, unknown>
}) => Promise<void> | void

/**
 * Sentinel for "no header / no footer" in the selects.
 *
 * Not a template id and never sent as one — an id column with a foreign key
 * cannot hold it. `handleSubmit` translates it into the boolean flags.
 */
const NONE = '__none__'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: Mode
  onSubmit: PageFormSubmit
}

/** Slug that may contain `/` for nested paths (e.g. "about/team"). */
function pathify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/-*\/-*/g, '/')
    .replace(/^[-/]+|[-/]+$/g, '')
    .slice(0, 120)
}

export function PageFormDialog({ open, onOpenChange, mode, onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [path, setPath] = useState('')
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [renderMode, setRenderMode] = useState<PageRenderMode>('SSR')
  const [buildWith, setBuildWith] = useState<BuildWith>('BUILDER')
  const [component, setComponent] = useState<string>('')
  const [layoutId, setLayoutId] = useState<string>('')
  const [headerTemplateId, setHeaderTemplateId] = useState<string>('')
  const [footerTemplateId, setFooterTemplateId] = useState<string>('')
  const [pathDirty, setPathDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seo, setSeo] = useState<Record<string, unknown>>({})

  // Each picker's list is only fetched once its choice is active — most pages
  // never need either.
  const codeQuery = useCodeComponents(buildWith === 'CODE')
  const codeOptions: AppSelectOption[] = (codeQuery.data ?? []).map((slug) => ({
    value: slug,
    label: slug,
  }))
  const kitQuery = useCustomTemplates(buildWith === 'KIT')
  const kitOptions: AppSelectOption[] = (kitQuery.data ?? []).map((kit) => ({
    value: kit.id,
    label: kit.description ? `${kit.name} — ${kit.description}` : kit.name,
  }))

  const layoutsQuery = useTemplatesList('LAYOUT')
  const headersQuery = useTemplatesList('HEADER')
  const footersQuery = useTemplatesList('FOOTER')

  // Code-chrome templates from kits, offered in the same pickers (value carries
  // the `codetpl:` pointer so the submit routes it to the code column).
  const codeTplQuery = useCodeTemplates()
  const codeTpl = (type: 'HEADER' | 'FOOTER' | 'LAYOUT'): AppSelectOption[] =>
    (codeTplQuery.data ?? [])
      .filter((t) => t.type === type)
      .map((t) => ({
        value: `${CODETPL_PREFIX}${t.kit}/${type.toLowerCase()}`,
        label: `${t.kit} · code`,
      }))

  const layoutOptions: AppSelectOption[] = [
    { value: '', label: '— Default —' },
    ...(layoutsQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ...codeTpl('LAYOUT'),
  ]
  /**
   * Three states, not two.
   *
   * `''` (a null id) means "use the site default" and always did; `NONE` means
   * render no header/footer at all, which a sign-in screen or a bare landing
   * page needs and previously could not express. It is a UI-only sentinel —
   * the submit below turns it into the `hideHeader` / `hideFooter` flags,
   * because the id columns carry a real foreign key and cannot hold it.
   */
  const headerOptions: AppSelectOption[] = [
    { value: '', label: '— Default —' },
    { value: NONE, label: '— None (no header) —' },
    ...(headersQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ...codeTpl('HEADER'),
  ]
  const footerOptions: AppSelectOption[] = [
    { value: '', label: '— Default —' },
    { value: NONE, label: '— None (no footer) —' },
    ...(footersQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    ...codeTpl('FOOTER'),
  ]

  const modeKey = mode.kind === 'edit' ? `edit:${mode.row.id}` : 'create'

  /**
   * BUILDER pages already have a full SEO editor in the Puck builder, staged
   * into `draftSeo` and only promoted on Publish — this dialog's save flow
   * writes `seo` live, so a second SEO editor here for BUILDER pages would let
   * an operator bypass their own draft/publish review. CODE and KIT pages have
   * no builder at all, so this dialog is their only SEO surface.
   */
  const showSeo = mode.kind === 'edit' && buildWith !== 'BUILDER'
  // Fetches the full page (mode.row is a PageSummaryDto and doesn't carry seo).
  const pageQuery = usePage(mode.kind === 'edit' ? mode.row.id : '', showSeo)
  const seoSeededKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (mode.kind === 'edit') {
      setTitle(mode.row.title)
      setPath(mode.row.path)
      setStatus(mode.row.status)
      setRenderMode(mode.row.renderMode)
      const rowComponent = mode.row.component ?? ''
      if ((mode.row.kind ?? 'BUILDER') !== 'CODE') {
        setBuildWith('BUILDER')
        setComponent('')
      } else if (rowComponent.startsWith(KIT_PREFIX)) {
        setBuildWith('KIT')
        setComponent(rowComponent.slice(KIT_PREFIX.length))
      } else {
        setBuildWith('CODE')
        setComponent(rowComponent)
      }
      // A set code pointer wins the slot; else the FK id, the hide flag, or default.
      setLayoutId(mode.row.codeLayout ?? mode.row.layoutId ?? '')
      setHeaderTemplateId(
        mode.row.codeHeader ?? (mode.row.hideHeader ? NONE : (mode.row.headerTemplateId ?? ''))
      )
      setFooterTemplateId(
        mode.row.codeFooter ?? (mode.row.hideFooter ? NONE : (mode.row.footerTemplateId ?? ''))
      )
      setPathDirty(true)
    } else {
      setTitle('')
      setPath('')
      setStatus('DRAFT')
      setRenderMode('SSR')
      // Builder is the default deliberately — coded pages are the exception.
      setBuildWith('BUILDER')
      setComponent('')
      setLayoutId('')
      setHeaderTemplateId('')
      setFooterTemplateId('')
      setPathDirty(false)
    }
    setError(null)
    setSeo({})
    seoSeededKeyRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modeKey])

  // Seeds `seo` from the fetched full page once per dialog open — not on every
  // `pageQuery.data` reference change (a background refetch, e.g. from another
  // mutation invalidating the same query key, would otherwise clobber edits the
  // operator has made in this dialog since it opened).
  useEffect(() => {
    if (!open || !showSeo || !pageQuery.data) return
    if (seoSeededKeyRef.current === modeKey) return
    setSeo(pageQuery.data.seo ?? {})
    seoSeededKeyRef.current = modeKey
  }, [open, showSeo, modeKey, pageQuery.data])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // `buildWith` is a UI choice; both coded options persist as `kind='CODE'`,
      // a kit distinguished by the `kit:` prefix on its component value.
      const kind: PageKind = buildWith === 'BUILDER' ? 'BUILDER' : 'CODE'
      const componentValue =
        buildWith === 'KIT'
          ? component
            ? `${KIT_PREFIX}${component}`
            : null
          : buildWith === 'CODE'
            ? component || null
            : null
      // Each chrome select routes to either the FK id or the code column.
      // `NONE` (header/footer) is not an id — it becomes the hide flag.
      const layout = splitChrome(layoutId)
      const headerSel = headerTemplateId === NONE ? null : splitChrome(headerTemplateId)
      const footerSel = footerTemplateId === NONE ? null : splitChrome(footerTemplateId)
      await onSubmit({
        title: title.trim(),
        path: pathify(path || title),
        status,
        renderMode,
        kind,
        component: componentValue,
        layoutId: layout.templateId,
        codeLayout: layout.code,
        headerTemplateId: headerSel?.templateId ?? null,
        codeHeader: headerSel?.code ?? null,
        footerTemplateId: footerSel?.templateId ?? null,
        codeFooter: footerSel?.code ?? null,
        hideHeader: headerTemplateId === NONE,
        hideFooter: footerTemplateId === NONE,
        // Omitted entirely (not sent as {}) when the section isn't shown, so a
        // BUILDER page's Puck-managed `seo` is never touched from here.
        ...(showSeo ? { seo } : {}),
      })
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save'))
    } finally {
      setSubmitting(false)
    }
  }

  const seoStr = (k: string) => (typeof seo[k] === 'string' ? (seo[k] as string) : '')
  const patchSeo = (p: Record<string, unknown>) => setSeo((prev) => ({ ...prev, ...p }))
  const seoMetaTags: MetaTag[] = Array.isArray(seo.meta) ? (seo.meta as MetaTag[]) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        bare
        className={cn(
          'flex max-h-[85vh] flex-col',
          // Wider when the SEO section is showing: it lays the preview and its
          // fields out side by side, which needs more room than the plain
          // settings fields above ever do.
          showSeo ? 'sm:max-w-2xl' : 'sm:max-w-md'
        )}
      >
        <DialogHeader>
          <DialogTitle>{mode.kind === 'edit' ? 'Edit page' : 'New page'}</DialogTitle>
          <DialogDescription>
            {mode.kind === 'edit'
              ? 'Update this page’s settings.'
              : 'Create a page, then design it in the visual builder — or point it at a component you wrote yourself.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="page-title">Title</Label>
              <Input
                id="page-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (!pathDirty) setPath(pathify(e.target.value))
                }}
                required
                minLength={1}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="page-path">Path</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="page-path"
                  value={path}
                  onChange={(e) => {
                    setPath(e.target.value)
                    setPathDirty(true)
                  }}
                  placeholder="about/team"
                  required
                  minLength={1}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="page-kind">Built with</Label>
              <AppSelect
                id="page-kind"
                value={buildWith}
                onChange={(v) => {
                  // Clear the picker so a value from the other coded choice can't
                  // carry over (a single-file slug is not a kit id).
                  setBuildWith(v as BuildWith)
                  setComponent('')
                }}
                options={[
                  { value: 'BUILDER', label: 'Visual builder' },
                  { value: 'CODE', label: 'Custom React component (single file)' },
                  { value: 'KIT', label: 'Custom template (coded)' },
                ]}
                isSearchable={false}
              />
            </div>

            {buildWith === 'CODE' ? (
              <div className="space-y-2">
                <Label htmlFor="page-component">Component</Label>
                {/*
                A select, never a text field: the list comes from the same
                generated manifest the server validates against, so an operator
                cannot type a name that will fail to render.
              */}
                <AppSelect
                  id="page-component"
                  value={component}
                  onChange={setComponent}
                  options={codeOptions}
                  placeholder={codeQuery.isLoading ? 'Loading…' : '— Choose a component —'}
                />
                <p className="text-xs text-muted-foreground">
                  {codeOptions.length
                    ? 'From inertia/custom/pages/. Adding a file there needs a front-end rebuild before it appears.'
                    : 'No components found. Add one under inertia/custom/pages/ and rebuild the front end.'}
                </p>
              </div>
            ) : null}

            {buildWith === 'KIT' ? (
              <div className="space-y-2">
                <Label htmlFor="page-kit">Custom template</Label>
                <AppSelect
                  id="page-kit"
                  value={component}
                  onChange={setComponent}
                  options={kitOptions}
                  placeholder={kitQuery.isLoading ? 'Loading…' : '— Choose a template —'}
                />
                <p className="text-xs text-muted-foreground">
                  {kitOptions.length
                    ? 'A self-contained folder under inertia/custom/kits/. Adding one needs a front-end rebuild before it appears.'
                    : 'No custom templates found. Add a folder under inertia/custom/kits/ (see its README) and rebuild.'}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="page-status">Status</Label>
                <AppSelect
                  id="page-status"
                  value={status}
                  onChange={(v) => setStatus(v as 'DRAFT' | 'PUBLISHED')}
                  options={[
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'PUBLISHED', label: 'Published' },
                  ]}
                  isSearchable={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="page-render">Render mode</Label>
                <AppSelect
                  id="page-render"
                  value={renderMode}
                  onChange={(v) => setRenderMode(v as PageRenderMode)}
                  options={[
                    { value: 'SSR', label: 'SSR (server-rendered)' },
                    { value: 'SSG', label: 'Static (cached)' },
                    { value: 'CSR', label: 'PWA (client)' },
                  ]}
                  isSearchable={false}
                />
              </div>
            </div>

            {buildWith === 'BUILDER' ? (
              <div className="space-y-2">
                <Label htmlFor="page-layout">Layout</Label>
                <AppSelect
                  id="page-layout"
                  value={layoutId}
                  onChange={setLayoutId}
                  options={layoutOptions}
                  placeholder="— Default —"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="page-header">Header override</Label>
                <AppSelect
                  id="page-header"
                  value={headerTemplateId}
                  onChange={setHeaderTemplateId}
                  options={headerOptions}
                  placeholder="— Default —"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="page-footer">Footer override</Label>
                <AppSelect
                  id="page-footer"
                  value={footerTemplateId}
                  onChange={setFooterTemplateId}
                  options={footerOptions}
                  placeholder="— Default —"
                />
              </div>
            </div>

            {showSeo ? (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h3 className="text-sm font-medium">Search &amp; social</h3>
                  <p className="text-xs text-muted-foreground">
                    This page has no visual builder, so its SEO fields live here instead.
                  </p>
                </div>
                {pageQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                ) : (
                  <>
                    {/* Side by side once the wider (showSeo) dialog width gives
                        them room: the preview on its own, the fields in their own
                        column. Stacks back to one column below `sm`. No-index and
                        the meta-tag list are wider/differently-shaped, so they sit
                        full-width below this row instead of squeezed into it. */}
                    <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-start">
                      <SeoPreview
                        title={seoStr('title') || title || 'Untitled page'}
                        description={seoStr('description')}
                        url={`${typeof window !== 'undefined' ? window.location.origin : ''}/${path.replace(/^\/+/, '')}`.replace(
                          /\/$/,
                          ''
                        )}
                        image={seoStr('ogImage')}
                      />
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="page-seo-title">Meta title</Label>
                          <Input
                            id="page-seo-title"
                            value={seoStr('title')}
                            onChange={(e) => patchSeo({ title: e.target.value })}
                            placeholder="Falls back to the page title if empty"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="page-seo-description">Meta description</Label>
                          <Textarea
                            id="page-seo-description"
                            rows={3}
                            value={seoStr('description')}
                            onChange={(e) => patchSeo({ description: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Open Graph image</Label>
                          <MediaField
                            value={seoStr('ogImage')}
                            onChange={(url) => patchSeo({ ogImage: url })}
                            mimeFilter={isImageMime}
                            accept="image/*"
                            kindLabel="image"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="page-seo-canonical">Canonical URL</Label>
                          <Input
                            id="page-seo-canonical"
                            value={seoStr('canonical')}
                            onChange={(e) => patchSeo({ canonical: e.target.value })}
                            placeholder="https://example.com/page"
                          />
                        </div>
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <span>
                        <span className="block text-sm font-medium">No-index</span>
                        <span className="block text-xs text-muted-foreground">
                          Ask search engines not to index this page.
                        </span>
                      </span>
                      <Switch
                        checked={seo.noindex === true}
                        onCheckedChange={(v) => patchSeo({ noindex: v })}
                      />
                    </label>
                    <MetaTagsEditor
                      tags={seoMetaTags}
                      onChange={(next) => patchSeo({ meta: next })}
                    />
                  </>
                )}
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || (buildWith !== 'BUILDER' && !component)}>
              {submitting ? 'Saving…' : mode.kind === 'edit' ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
