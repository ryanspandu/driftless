import { router } from '@inertiajs/react'
import { LayoutList } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { PageHeader } from '~/components/admin/page-header'
import { FormsInbox } from '~/components/admin/forms-inbox'

/** The global inbox — every form's submissions. Per-form views live on each form's page. */
export default function FormsSubmissionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Form submissions"
        subtitle="Everything captured by your forms. Open a form to see just its submissions."
        actions={
          <Button variant="outline" className="gap-2" onClick={() => router.visit('/admin/forms')}>
            <LayoutList className="size-4" /> Forms
          </Button>
        }
      />
      <FormsInbox />
    </div>
  )
}
