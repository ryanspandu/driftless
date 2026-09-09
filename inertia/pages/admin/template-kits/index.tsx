import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Info, Package, Upload } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { DragDropImageUpload } from '~/components/drag-drop-image-upload'
import { PageHeader } from '~/components/admin/page-header'
import {
  useImportTemplateKit,
  useSetKitActive,
  useTemplateKits,
  type TemplateKitDto,
} from '~/hooks/api/use-template-kits'

const REBUILD_NOTICE =
  'Kits load at build time. After importing, run the template generator and rebuild + restart the app before an imported kit is routable.'

function countLine(counts: TemplateKitDto['counts']): string {
  const parts: string[] = []
  if (counts.pages) parts.push(`${counts.pages} page${counts.pages === 1 ? '' : 's'}`)
  if (counts.templates) parts.push(`${counts.templates} template${counts.templates === 1 ? '' : 's'}`)
  if (counts.collection)
    parts.push(`${counts.collection} collection${counts.collection === 1 ? '' : 's'}`)
  if (counts.emails) parts.push(`${counts.emails} email${counts.emails === 1 ? '' : 's'}`)
  if (counts.components)
    parts.push(`${counts.components} component${counts.components === 1 ? '' : 's'}`)
  return parts.join(' · ') || 'No template files'
}

function KitCard({ kit }: { kit: TemplateKitDto }) {
  const setActive = useSetKitActive()
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-indigo-600 dark:text-indigo-400">
          <Package className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{kit.name}</span>
            {kit.active ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {kit.isolate ? <Badge variant="secondary">Isolated</Badge> : null}
            {kit.protected ? <Badge variant="outline">Reference</Badge> : null}
          </div>
          <span className="block truncate font-mono text-xs text-muted-foreground">{kit.id}</span>
        </div>
      </div>
      {kit.description ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{kit.description}</p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">{countLine(kit.counts)}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Switch
            checked={kit.active}
            disabled={setActive.isPending}
            onCheckedChange={(active) => {
              setActive.mutate(
                { id: kit.id, active },
                {
                  onSuccess: () =>
                    toast.success(active ? `"${kit.name}" activated` : `"${kit.name}" deactivated`),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : 'Could not update kit'),
                }
              )
            }}
          />
          {kit.active ? 'Active' : 'Inactive'}
        </label>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          render={<a href={`/api/admin/template-kits/${kit.id}/export`} />}
        >
          <Download className="size-4" />
          Export
        </Button>
      </div>
    </div>
  )
}

function ImportKitDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const importMut = useImportTemplateKit()
  const [error, setError] = useState<string | null>(null)

  const close = (next: boolean) => {
    if (!next) setError(null)
    onOpenChange(next)
  }

  const onFile = async (file: File) => {
    setError(null)
    try {
      const result = await importMut.mutateAsync(file)
      toast.success(`Kit "${result.id}" installed (${result.files} files)`)
      close(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import template kit</DialogTitle>
          <DialogDescription>{REBUILD_NOTICE}</DialogDescription>
        </DialogHeader>
        <DragDropImageUpload
          onFile={onFile}
          accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
          hint="A .tar.gz kit archive exported from a Driftless install."
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default function TemplateKitsPage() {
  const query = useTemplateKits()
  const kits = query.data ?? []
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Template Kit"
        subtitle="Export & import custom-code template kits for migrating between installs"
        count={query.isLoading ? undefined : kits.length}
        actions={
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            Import
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{REBUILD_NOTICE}</span>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[132px] animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : kits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No template kits installed. Import a <code>.tar.gz</code> kit to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kits.map((kit) => (
            <KitCard key={kit.id} kit={kit} />
          ))}
        </div>
      )}

      <ImportKitDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
