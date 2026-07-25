import { ContentEditorForm } from '~/components/admin/content-editor-form'
import { useOfflineContent } from '~/hooks/offline/use-offline-content'

export default function NewContentPage() {
  const { create } = useOfflineContent()
  return (
    <ContentEditorForm
      heading="New content"
      submitLabel="Create"
      onSave={async (values) => {
        await create(values)
      }}
    />
  )
}
