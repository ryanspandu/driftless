import { router } from '@inertiajs/react'
import { useMemo, useState } from 'react'
import { History, Trash2 } from 'lucide-react'
import {
  isCustomCollectionIcon,
  resolveCollectionLucideIcon,
} from '~/components/cms/collection-icon-lucide'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { RecordForm } from '~/components/cms/record-form'
import { RevisionsPanel } from '~/components/cms/revisions-panel'
import { BackButton } from '~/components/admin/back-button'
import { useCmsCollection } from '~/hooks/api/use-cms-collections'
import { useOfflineRecords } from '~/hooks/offline/use-offline-records'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

interface CmsRecordEditPageProps {
  collectionKey: string
  recordId: string
  isNew?: boolean
}

export default function CmsRecordEditPage({
  collectionKey: key,
  recordId,
}: CmsRecordEditPageProps) {
  const isNew = recordId === 'new'
  const confirmDelete = useConfirmDelete()

  const collectionQuery = useCmsCollection(key)
  const offline = useOfflineRecords(key)
  const collection = collectionQuery.data

  const record = useMemo(() => {
    if (isNew) return null
    return offline.rows.find((r) => r.data.id === recordId)?.data ?? null
  }, [offline.rows, recordId, isNew])

  const [revisionsOpen, setRevisionsOpen] = useState(false)

  const isLoading = collectionQuery.isLoading || (!isNew && offline.isLoading && !record)

  const iconValue = collection?.icon ?? 'LayoutList'
  const isCustomImage = isCustomCollectionIcon(iconValue)
  const CollectionLucideIcon = resolveCollectionLucideIcon(iconValue)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BackButton href={`/admin/cms/${encodeURIComponent(key)}`} label="Back to records" />
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50 text-foreground/80">
          {isCustomImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL / remote icon
            <img src={iconValue} alt="" className="size-full object-cover" />
          ) : (
            <CollectionLucideIcon className="size-5" aria-hidden />
          )}
        </span>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isNew ? 'New' : 'Edit'} {collection?.label ?? key}
          </h1>
          {!isNew ? (
            <p className="text-sm text-muted-foreground">
              <code className="font-mono">{recordId}</code>
            </p>
          ) : null}
        </div>
        {collection?.revisionsOn ? (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setRevisionsOpen(true)}
            disabled={!record}
          >
            <History className="size-4" />
            Revisions
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Changes save offline-first and sync in the background.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !collection ? (
            <p className="text-sm text-muted-foreground">This collection no longer exists.</p>
          ) : isNew ? (
            <RecordForm
              collection={collection}
              submitLabel="Create record"
              onCancel={() => router.visit(`/admin/cms/${encodeURIComponent(key)}`)}
              onSubmit={async (value) => {
                await offline.create(value)
                router.visit(`/admin/cms/${encodeURIComponent(key)}`)
              }}
            />
          ) : !record ? (
            <p className="text-sm text-muted-foreground">
              Record not found in the local cache. It may have been deleted or the sync engine
              hasn&apos;t fetched it yet.
            </p>
          ) : (
            <RecordForm
              collection={collection}
              initial={record}
              submitLabel="Save changes"
              onCancel={() => router.visit(`/admin/cms/${encodeURIComponent(key)}`)}
              extraActions={
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  onClick={() => {
                    void confirmDelete({
                      description: `Delete record "${record.id}"?`,
                    }).then(async (confirmed) => {
                      if (!confirmed) return
                      await offline.remove(record.id)
                      router.visit(`/admin/cms/${encodeURIComponent(key)}`)
                    })
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              }
              onSubmit={async (value) => {
                await offline.update(record.id, value)
                router.visit(`/admin/cms/${encodeURIComponent(key)}`)
              }}
            />
          )}
        </CardContent>
      </Card>

      {collection && record ? (
        <RevisionsPanel
          open={revisionsOpen}
          onOpenChange={setRevisionsOpen}
          collectionKey={collection.key}
          recordId={record.id}
        />
      ) : null}
    </div>
  )
}
