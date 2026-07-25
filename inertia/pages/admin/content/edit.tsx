import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { ContentEditorForm } from '~/components/admin/content-editor-form'
import { PageHeader } from '~/components/admin/page-header'
import { useOfflineContent } from '~/hooks/offline/use-offline-content'

export default function EditContentPage({ id }: { id: string }) {
  const { rows, isLoading, update } = useOfflineContent()
  const row = useMemo(() => rows.find((r) => r.id === id)?.data ?? null, [rows, id])

  if (!row) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit content" subtitle="Update this post." />
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <p className="text-sm">Content not found.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <ContentEditorForm
      key={row.id}
      initial={row}
      heading="Edit content"
      submitLabel="Save changes"
      onSave={async (values) => {
        await update(row.id, values)
      }}
    />
  )
}
