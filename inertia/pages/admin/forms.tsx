import { useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { Envelope, EnvelopeOpen, Trash, WarningOctagon } from '@phosphor-icons/react'
import { Card, CardContent } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  useDeleteFormSubmission,
  useFormSubmissions,
  useUpdateFormStatus,
  type FormStatus,
  type FormSubmission,
} from '~/hooks/api/use-forms'

type Filter = FormStatus | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'spam', label: 'Spam' },
]

function fmtDateTime(iso: string): string {
  const d = DateTime.fromISO(iso)
  return d.isValid ? d.toFormat('d LLL yyyy, HH:mm') : iso
}

function statusBadge(status: FormStatus) {
  if (status === 'new') return <Badge variant="default">New</Badge>
  if (status === 'spam') return <Badge variant="destructive">Spam</Badge>
  return <Badge variant="secondary">Read</Badge>
}

/** First human-friendly value to preview in the list row. */
function preview(sub: FormSubmission): string {
  const entries = Object.entries(sub.data)
  const msg = entries.find(([k]) => /message|body|comment|note/i.test(k))
  const pick = msg ?? entries.find(([k]) => !/email|name/i.test(k)) ?? entries[0]
  if (!pick) return '—'
  return String(pick[1] ?? '').slice(0, 120) || '—'
}

export default function FormsPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<FormSubmission | null>(null)
  const { data, isPending, isError } = useFormSubmissions(filter)
  const updateStatus = useUpdateFormStatus()
  const del = useDeleteFormSubmission()

  const items = data?.items ?? []
  const unread = data?.unread ?? 0

  const openDetail = (sub: FormSubmission) => {
    setOpen(sub)
    if (sub.status === 'new') updateStatus.mutate({ id: sub.id, status: 'read' })
  }

  const detailEntries = useMemo(() => (open ? Object.entries(open.data) : []), [open])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Form submissions</h1>
          <p className="text-sm text-muted-foreground">
            Messages captured by builder forms set to “Collect submissions”.
          </p>
        </div>
        {unread > 0 && (
          <Badge variant="default" className="h-6">
            {unread} unread
          </Badge>
        )}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn’t load submissions.</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No submissions here yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((sub) => (
            <Card
              key={sub.id}
              role="button"
              tabIndex={0}
              onClick={() => openDetail(sub)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openDetail(sub)
                }
              }}
              className={
                'cursor-pointer transition-colors hover:border-ring ' +
                (sub.status === 'new' ? 'border-l-2 border-l-primary' : '')
              }
            >
              <CardContent className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{sub.formName}</span>
                    {statusBadge(sub.status)}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {sub.email ? <span className="text-foreground">{sub.email}</span> : null}
                    {sub.email ? ' · ' : ''}
                    {preview(sub)}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {fmtDateTime(sub.createdAt)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {open.formName}
                  {statusBadge(open.status)}
                </DialogTitle>
                <DialogDescription>
                  {fmtDateTime(open.createdAt)}
                  {open.pagePath ? ` · ${open.pagePath}` : ''}
                </DialogDescription>
              </DialogHeader>

              <dl className="max-h-[50vh] space-y-3 overflow-y-auto text-sm">
                {detailEntries.length === 0 ? (
                  <p className="text-muted-foreground">No fields.</p>
                ) : (
                  detailEntries.map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {key}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap break-words">
                        {String(value ?? '') || '—'}
                      </dd>
                    </div>
                  ))
                )}
              </dl>

              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    del.mutate(open.id)
                    setOpen(null)
                  }}
                >
                  <Trash className="size-4" /> Delete
                </Button>
                <div className="flex gap-2">
                  {open.status !== 'spam' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateStatus.mutate({ id: open.id, status: 'spam' })
                        setOpen(null)
                      }}
                    >
                      <WarningOctagon className="size-4" /> Mark spam
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateStatus.mutate({ id: open.id, status: 'read' })
                        setOpen(null)
                      }}
                    >
                      <EnvelopeOpen className="size-4" /> Not spam
                    </Button>
                  )}
                  {open.status === 'read' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateStatus.mutate({ id: open.id, status: 'new' })}
                    >
                      <Envelope className="size-4" /> Mark unread
                    </Button>
                  ) : null}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
