import { useEffect, useState } from 'react'
import { PageHeader } from '~/components/admin/page-header'
import { BackButton } from '~/components/admin/back-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'
import { FileArchive } from 'lucide-react'
import { apiFetch } from '~/lib/api-client'

interface Section {
  name: string
  label: string
  owner: string
}
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

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

export default function DataTransferPage() {
  const [sections, setSections] = useState<Section[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState('preserve')
  const [conflict, setConflict] = useState('overwrite')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ sections: Section[] }>('/api/admin/data-transfer/manifest')
      .then((r) => {
        setSections(r.sections)
        setSelected(new Set(r.sections.map((s) => s.name)))
      })
      .catch(() => setError('Could not load the section list.'))
  }, [])

  const allSelected = sections.length > 0 && selected.size === sections.length
  const onlyList = allSelected ? undefined : [...selected]

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function doExport() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/data-transfer/export', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': csrfToken() },
        body: JSON.stringify({ only: onlyList, mode }),
      })
      if (!res.ok) {
        // The server returns { message } on a handled failure — surface it.
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(
          body?.message ? `Export failed: ${body.message}` : `Export failed (${res.status})`
        )
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `site-${new Date().toISOString().slice(0, 10)}.driftless`
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
      if (onlyList) fd.append('only', onlyList.join(','))
      const res = await fetch('/api/admin/data-transfer/import', {
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
      <div className="flex items-center gap-3">
        <BackButton href="/admin/settings" label="Back to settings" />
        <PageHeader
          title="Export / Import"
          subtitle="Move the whole site — pages, templates, collections, content, media, settings and store — between environments, or back it up."
          className="flex-1"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Sections</CardTitle>
          <CardDescription>
            Choose what to include. All selected means the whole site.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {sections.map((s) => (
            <label
              key={s.name}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <Checkbox checked={selected.has(s.name)} onCheckedChange={() => toggle(s.name)} />
              <span>{s.label}</span>
              {s.owner !== 'core' ? (
                <span className="text-xs text-muted-foreground">({s.owner})</span>
              ) : null}
            </label>
          ))}
        </CardContent>
      </Card>

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
          <CardDescription>Download a .driftless archive of the selected sections.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={doExport} disabled={busy}>
            Download archive
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import</CardTitle>
          <CardDescription>
            Upload a .driftless archive. Preview with a dry-run first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
                : 'A .driftless archive.'}
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
                {report.log.map((l, i) => (
                  <li key={i}>{l}</li>
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
