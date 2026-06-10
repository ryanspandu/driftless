
import { Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { PermissionForm } from '~/components/admin/permission-form'
import { useCreatePermission } from '~/hooks/api/use-permissions'
import { useRouter } from '~/hooks/use-inertia-url'

export default function NewPermissionPage() {
  const router = useRouter()
  const createMut = useCreatePermission()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          render={<Link href="/admin/permissions" aria-label="Back to permissions" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New permission</h1>
          <p className="text-sm text-muted-foreground">
            Define a new permission code that roles can grant.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission details</CardTitle>
          <CardDescription>
            Use a clear namespace so it&apos;s easy to grep later (e.g.{' '}
            <code>report:export</code>, <code>billing:read</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionForm
            mode="create"
            submitting={createMut.isPending}
            onCancel={() => router.push('/admin/permissions')}
            onSubmit={async (value) => {
              const created = await createMut.mutateAsync(value)
              router.push(`/admin/permissions/${created.id}`)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
