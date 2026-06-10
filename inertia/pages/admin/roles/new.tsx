
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
import { RoleForm } from '~/components/admin/role-form'
import { useCreateRole } from '~/hooks/api/use-roles'
import { usePermissionsList } from '~/hooks/api/use-permissions'
import { useRouter } from '~/hooks/use-inertia-url'

export default function NewRolePage() {
  const router = useRouter()
  const permissionsQuery = usePermissionsList()
  const createMut = useCreateRole()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          render={<Link href="/admin/roles" aria-label="Back to roles" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New role</h1>
          <p className="text-sm text-muted-foreground">
            Create a custom role and pick the permissions it grants.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
          <CardDescription>
            Choose a descriptive name (e.g. <em>Editor</em>, <em>Content Reviewer</em>) and tick the
            permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {permissionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading permissions…</p>
          ) : permissionsQuery.error ? (
            <p className="text-sm text-destructive">{(permissionsQuery.error as Error).message}</p>
          ) : (
            <RoleForm
              mode="create"
              allPermissions={permissionsQuery.data ?? []}
              submitting={createMut.isPending}
              onCancel={() => router.push('/admin/roles')}
              onSubmit={async (value) => {
                const created = await createMut.mutateAsync({
                  name: value.name,
                  description: value.description,
                  permissions: value.permissions,
                })
                router.push(`/admin/roles/${created.id}`)
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
