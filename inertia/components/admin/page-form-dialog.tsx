import { FormEvent, useEffect, useState } from 'react'
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
import { AppSelect, type AppSelectOption } from '~/components/ui/app-select'
import { apiErrorMessage } from '~/lib/api'
import { useTemplatesList } from '~/hooks/api/use-templates'
import { useCodeComponents } from '~/hooks/api/use-pages'

type Mode = { kind: 'create' } | { kind: 'edit'; row: PageSummaryDto }

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
  hideHeader: boolean
  hideFooter: boolean
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
  const [kind, setKind] = useState<PageKind>('BUILDER')
  const [component, setComponent] = useState<string>('')
  const [layoutId, setLayoutId] = useState<string>('')
  const [headerTemplateId, setHeaderTemplateId] = useState<string>('')
  const [footerTemplateId, setFooterTemplateId] = useState<string>('')
  const [pathDirty, setPathDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only asked for once the operator picks Code — most pages never need it.
  const codeQuery = useCodeComponents(kind === 'CODE')
  const codeOptions: AppSelectOption[] = (codeQuery.data ?? []).map((slug) => ({
    value: slug,
    label: slug,
  }))

  const layoutsQuery = useTemplatesList('LAYOUT')
  const headersQuery = useTemplatesList('HEADER')
  const footersQuery = useTemplatesList('FOOTER')

  const layoutOptions: AppSelectOption[] = [
    { value: '', label: '— Default —' },
    ...(layoutsQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
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
  ]
  const footerOptions: AppSelectOption[] = [
    { value: '', label: '— Default —' },
    { value: NONE, label: '— None (no footer) —' },
    ...(footersQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
  ]

  const modeKey = mode.kind === 'edit' ? `edit:${mode.row.id}` : 'create'

  useEffect(() => {
    if (!open) return
    if (mode.kind === 'edit') {
      setTitle(mode.row.title)
      setPath(mode.row.path)
      setStatus(mode.row.status)
      setRenderMode(mode.row.renderMode)
      setKind(mode.row.kind ?? 'BUILDER')
      setComponent(mode.row.component ?? '')
      setLayoutId(mode.row.layoutId ?? '')
      setHeaderTemplateId(mode.row.hideHeader ? NONE : (mode.row.headerTemplateId ?? ''))
      setFooterTemplateId(mode.row.hideFooter ? NONE : (mode.row.footerTemplateId ?? ''))
      setPathDirty(true)
    } else {
      setTitle('')
      setPath('')
      setStatus('DRAFT')
      setRenderMode('SSR')
      // Builder is the default deliberately — code pages are the exception.
      setKind('BUILDER')
      setComponent('')
      setLayoutId('')
      setHeaderTemplateId('')
      setFooterTemplateId('')
      setPathDirty(false)
    }
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modeKey])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        path: pathify(path || title),
        status,
        renderMode,
        kind,
        component: kind === 'CODE' ? component || null : null,
        layoutId: layoutId || null,
        // `NONE` is not an id — it becomes the hide flag, and clears the id so
        // the two can never disagree about what this page renders.
        headerTemplateId: headerTemplateId === NONE ? null : headerTemplateId || null,
        footerTemplateId: footerTemplateId === NONE ? null : footerTemplateId || null,
        hideHeader: headerTemplateId === NONE,
        hideFooter: footerTemplateId === NONE,
      })
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode.kind === 'edit' ? 'Edit page' : 'New page'}</DialogTitle>
          <DialogDescription>
            {mode.kind === 'edit'
              ? 'Update this page’s settings.'
              : 'Create a page, then design it in the visual builder — or point it at a component you wrote yourself.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              value={kind}
              onChange={(v) => setKind(v as PageKind)}
              options={[
                { value: 'BUILDER', label: 'Visual builder' },
                { value: 'CODE', label: 'Custom React component' },
              ]}
              isSearchable={false}
            />
          </div>

          {kind === 'CODE' ? (
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

          {kind === 'BUILDER' ? (
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

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || (kind === 'CODE' && !component)}>
              {submitting ? 'Saving…' : mode.kind === 'edit' ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
