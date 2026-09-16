import { useEffect, useState } from 'react'
import { PageHeader } from '~/components/admin/page-header'
import { BackButton } from '~/components/admin/back-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Label } from '~/components/ui/label'
import { Badge } from '~/components/ui/badge'
import { AppSelect } from '~/components/ui/app-select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'
import { ChevronDown, Download, FileArchive, Loader2 } from 'lucide-react'
import { apiFetch } from '~/lib/api-client'
import {
  useTransferJob,
  useTransferHistory,
  useInvalidateTransferHistory,
  type ImportResult,
  type TransferJobDto,
} from '~/hooks/api/use-data-transfer'

interface Section {
  name: string
  label: string
  owner: string
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function isActive(job: TransferJobDto | undefined): boolean {
  return job?.state === 'queued' || job?.state === 'running'
}

/** Section progress bar + current section + a live tail of the log. */
function ProgressPanel({ job }: { job: TransferJobDto }) {
  const pct = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Loader2 className="size-4 animate-spin" />
        {job.kind === 'import' ? 'Importing' : 'Exporting'}…
        {job.currentSection ? (
          <span className="text-muted-foreground">· {job.currentSection}</span>
        ) : null}
        <span className="ml-auto tabular-nums text-muted-foreground">
          {job.completed}/{job.total || '…'}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {job.logTail.length ? (
        <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
          {job.logTail.slice(-12).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Running in the background — safe to leave this page.
      </p>
    </div>
  )
}

/** A dry-run preview report — ephemeral, shown inline while the operator iterates. */
function ReportPanel({ result }: { result: ImportResult }) {
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="font-medium">
        {result.dryRun ? 'Dry-run' : 'Imported'} — {result.mode} / {result.conflict}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {result.log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        {result.skipped.map((s, i) => (
          <li key={`sk-${i}`} className="text-amber-600">
            skipped {s.name}: {s.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The full log/skipped detail for one finished job — the history row's expanded content. */
function JobDetail({ job }: { job: TransferJobDto }) {
  if (job.state === 'failed') {
    return <p className="text-sm text-destructive">{job.errorMessage ?? 'Import failed.'}</p>
  }
  const result = job.result as ImportResult | null
  if (!result) return <p className="text-sm text-muted-foreground">No details recorded.</p>
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {result.log.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
      {result.skipped.map((s, i) => (
        <li key={`sk-${i}`} className="text-amber-600">
          skipped {s.name}: {s.reason}
        </li>
      ))}
    </ul>
  )
}

/** Total rows a section touched, for the row's one-line summary before it's expanded. */
function resultSummary(result: ImportResult | null): string | null {
  if (!result?.sections?.length) return null
  const created = result.sections.reduce((n, s) => n + s.created, 0)
  const updated = result.sections.reduce((n, s) => n + s.updated, 0)
  return `+${created} created, ~${updated} updated`
}

/** Past import runs, most recent first, each collapsed until clicked. */
function HistoryList({ jobs }: { jobs: TransferJobDto[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (jobs.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">History</p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {jobs.map((job) => {
          const result = job.state === 'succeeded' ? (job.result as ImportResult | null) : null
          const summary = resultSummary(result)
          const open = openId === job.id
          return (
            <Collapsible
              key={job.id}
              open={open}
              onOpenChange={(next) => setOpenId(next ? job.id : null)}
            >
              <CollapsibleTrigger
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
              >
                <Badge variant={job.state === 'succeeded' ? 'success' : 'destructive'}>
                  {job.state === 'succeeded' ? 'Imported' : 'Failed'}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {job.finishedAt ? new Date(job.finishedAt).toLocaleString() : '—'}
                  {job.mode ? ` · ${job.mode}` : ''}
                  {summary ? ` · ${summary}` : ''}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t border-border px-3 py-2.5">
                <JobDetail job={job} />
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </div>
  )
}

export default function DataTransferPage() {
  const [sections, setSections] = useState<Section[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState('preserve')
  const [conflict, setConflict] = useState('overwrite')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dryReport, setDryReport] = useState<ImportResult | null>(null)
  const [importJobId, setImportJobId] = useState<string | null>(null)
  const [exportJobId, setExportJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const importJob = useTransferJob(importJobId).data
  const exportJob = useTransferJob(exportJobId).data
  const { data: importHistory = [] } = useTransferHistory('import')
  const invalidateHistory = useInvalidateTransferHistory()

  // Once a background import finishes, refresh the history list so the new
  // entry shows up there instead of leaving a separate flat report on screen.
  useEffect(() => {
    if (importJob && (importJob.state === 'succeeded' || importJob.state === 'failed')) {
      invalidateHistory('import')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJob?.state])

  useEffect(() => {
    apiFetch<{ sections: Section[] }>('/api/admin/data-transfer/manifest')
      .then((r) => {
        setSections(r.sections)
        setSelected(new Set(r.sections.map((s) => s.name)))
      })
      .catch(() => setError('Could not load the section list.'))
  }, [])

  // Re-attach to an in-flight (or freshly finished) job after a reload, so the
  // progress animation / download link survive a refresh instead of vanishing.
  useEffect(() => {
    for (const kind of ['import', 'export'] as const) {
      apiFetch<{ job: TransferJobDto | null }>(`/api/admin/data-transfer/latest/${kind}`)
        .then(({ job }) => {
          if (!job) return
          const active = job.state === 'queued' || job.state === 'running'
          const resumable =
            active ||
            // Keep the download link after a finished export, and the
            // success/failure report after a finished import, across a refresh.
            (kind === 'export' && job.state === 'succeeded' && job.downloadReady) ||
            (kind === 'import' && (job.state === 'succeeded' || job.state === 'failed'))
          if (!resumable) return
          if (kind === 'import') setImportJobId(job.id)
          else setExportJobId(job.id)
        })
        .catch(() => {})
    }
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

  async function post(url: string, body: BodyInit, json: boolean) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-XSRF-TOKEN': csrfToken(),
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
    })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) throw new Error((data?.message as string) ?? `Request failed (${res.status})`)
    return data ?? {}
  }

  async function doExport() {
    setSubmitting(true)
    setError(null)
    try {
      const data = await post(
        '/api/admin/data-transfer/export',
        JSON.stringify({ only: onlyList, mode }),
        true
      )
      setExportJobId(data.jobId as string)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function doImport(dryRun: boolean) {
    if (!file) {
      setError('Choose an archive first.')
      return
    }
    setSubmitting(true)
    setError(null)
    setDryReport(null)
    if (!dryRun) setImportJobId(null)
    try {
      const fd = new FormData()
      fd.append('archive', file)
      fd.append('mode', mode)
      fd.append('conflict', conflict)
      fd.append('dryRun', String(dryRun))
      if (onlyList) fd.append('only', onlyList.join(','))
      const data = await post('/api/admin/data-transfer/import', fd, false)
      if (dryRun) setDryReport(data.result as ImportResult)
      else setImportJobId(data.jobId as string)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const importActive = isActive(importJob)
  const exportActive = isActive(exportJob)

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
          <CardDescription>Build a .driftless archive of the selected sections.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" onClick={doExport} disabled={submitting || exportActive}>
            {exportActive ? 'Building…' : 'Build archive'}
          </Button>
          {exportActive && exportJob ? <ProgressPanel job={exportJob} /> : null}
          {exportJob?.state === 'succeeded' && exportJob.downloadReady ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-mono text-xs">
                  {exportJob.downloadName ?? 'archive.driftless'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2"
                render={
                  <a
                    href={`/api/admin/data-transfer/exports/${exportJob.id}/download`}
                    download={exportJob.downloadName ?? 'site.driftless'}
                  />
                }
              >
                <Download className="size-4" />
                Download
              </Button>
            </div>
          ) : null}
          {exportJob?.state === 'failed' ? (
            <p className="text-sm text-destructive">Export failed: {exportJob.errorMessage}</p>
          ) : null}
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
              setDryReport(null)
              setImportJobId(null)
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
              disabled={submitting || importActive || !file}
            >
              Preview (dry-run)
            </Button>
            <Button
              type="button"
              onClick={() => doImport(false)}
              disabled={submitting || importActive || !file}
            >
              {importActive ? 'Importing…' : 'Import'}
            </Button>
          </div>
          {importActive && importJob ? <ProgressPanel job={importJob} /> : null}
          {importJob?.state === 'failed' ? (
            <p className="text-sm text-destructive">Import failed: {importJob.errorMessage}</p>
          ) : null}
          {dryReport ? <ReportPanel result={dryReport} /> : null}
          <HistoryList jobs={importHistory} />
        </CardContent>
      </Card>
    </div>
  )
}
