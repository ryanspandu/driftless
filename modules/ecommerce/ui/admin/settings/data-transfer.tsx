import { useState } from 'react'
import { AlertTriangle, FileArchive } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'

interface SectionReport {
  name: string
  created: number
  updated: number
  skipped: number
  warnings: string[]
}
interface ImportResult {
  dryRun: boolean
  mode: string
  conflict: string
  sections: SectionReport[]
  skipped: Array<{ name: string; reason: string }>
  log: string[]
}

/** The two store data sections, shown as export scopes. */
const SCOPES = [
  { name: 'ecommerce', label: 'Catalog & store settings' },
  { name: 'ecommerce_orders', label: 'Orders & customers' },
] as const

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

/**
 * Backup / migrate all store data as a `.driftless` archive. Reuses the
 * whole-site export/import engine, scoped server-side to the ecommerce sections.
 * Gateway secrets, sessions and webhook/replay tables are never included.
 */
export default function DataTransferPanel() {
  const [selected, setSelected] = useState<Set<string>>(new Set(SCOPES.map((s) => s.name)))
  const [mode, setMode] = useState('preserve')
  const [conflict, setConflict] = useState('overwrite')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sectionsList = [...selected]

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function doExport() {
    if (sectionsList.length === 0) {
      setError('Choose at least one scope to export.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/ecommerce/data/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrfToken() },
        body: JSON.stringify({ sections: sectionsList, mode }),
      })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ecommerce-${new Date().toISOString().slice(0, 10)}.driftless`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function doImport(dryRun: boolean) {
    if (!file) {
      setError('Choose an archive first.')
      return
    }
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const fd = new FormData()
      fd.append('archive', file)
      fd.append('mode', mode)
      fd.append('conflict', conflict)
      fd.append('dryRun', String(dryRun))
      const res = await fetch('/api/admin/ecommerce/data/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-XSRF-TOKEN': csrfToken() },
        body: fd,
      })
      const data = (await res.json()) as ImportResult & { message?: string }
      if (!res.ok) throw new Error(data.message ?? `Import failed (${res.status})`)
      setReport(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>ID mode</Label>
          <AppSelect
            value={mode}
            onChange={setMode}
            options={[
              { value: 'preserve', label: 'Preserve ids (migrate / restore)' },
              { value: 'regenerate', label: 'Regenerate ids (duplicate)' },
            ]}
          />
        </div>
        <div className="space-y-2">
          <Label>On conflict (import)</Label>
          <AppSelect
            value={conflict}
            onChange={setConflict}
            options={[
              { value: 'overwrite', label: 'Overwrite matching' },
              { value: 'skip', label: 'Skip existing' },
              { value: 'replace', label: 'Replace section' },
            ]}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>
            Download a <code>.driftless</code> archive of your store data. Payment gateway keys and
            webhook history are never included.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {SCOPES.map((s) => (
              <label
                key={s.name}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <Checkbox checked={selected.has(s.name)} onCheckedChange={() => toggle(s.name)} />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
          <Button type="button" onClick={doExport} disabled={busy}>
            Download archive
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import</CardTitle>
          <CardDescription>
            Restore or migrate store data from a <code>.driftless</code> archive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Import merges into the <strong>live store</strong> — orders are restored with their
              existing status. Run a dry-run first, and prefer a fresh install for a full migration.
            </span>
          </div>
          <DragDropImageUpload
            accept=".driftless"
            onFile={(f) => {
              setFile(f)
              setReport(null)
              setError(null)
            }}
          >
            <FileArchive className="size-8 text-muted-foreground" aria-hidden />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {file ? file.name : 'Drop a .driftless archive here'}
              </span>
              {file ? null : (
                <>
                  {' · '}
                  or click to choose
                </>
              )}
            </div>
            <p className="max-w-sm text-xs text-muted-foreground">
              {file
                ? `${(file.size / 1024).toFixed(0)} KB — click to replace`
                : 'A .driftless archive exported from a store.'}
            </p>
          </DragDropImageUpload>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => doImport(true)}
              disabled={busy || !file}
            >
              Preview (dry-run)
            </Button>
            <Button type="button" onClick={() => doImport(false)} disabled={busy || !file}>
              Import
            </Button>
          </div>
          {report ? (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-medium">
                {report.dryRun ? 'Dry-run' : 'Imported'} — {report.mode} / {report.conflict}
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {report.sections.map((s) => (
                  <li key={s.name}>
                    {s.name}: {s.created} created · {s.updated} updated · {s.skipped} skipped
                    {s.warnings.length ? ` · ${s.warnings.length} warning(s)` : ''}
                  </li>
                ))}
                {report.skipped.map((s, i) => (
                  <li key={`sk-${i}`} className="text-amber-600">
                    skipped {s.name}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
