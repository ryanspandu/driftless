import { Trash2 } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { BackButton } from '~/components/admin/back-button'
import { RoleForm } from '~/components/admin/role-form'
import { useDeleteRole, useRole, useUpdateRole } from '~/hooks/api/use-roles'
import { usePermissionsList } from '~/hooks/api/use-permissions'
import { useRouter } from '~/hooks/use-inertia-url'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

interface Props {
  roleId: string
}

export default function EditRolePage({ roleId }: Props) {
  const router = useRouter()
  const confirmDelete = useConfirmDelete()
  const roleQuery = useRole(roleId)
  const permsQuery = usePermissionsList()
  const updateMut = useUpdateRole()
  const deleteMut = useDeleteRole()

  const role = roleQuery.data
  const loading = roleQuery.isLoading || permsQuery.isLoading
  const err = roleQuery.error ?? permsQuery.error

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton href="/admin/roles" label="Back to roles" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{role?.name ?? 'Role'}</h1>
              {role?.isSystem ? <Badge variant="outline">system</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {role?.userCount != null
                ? `Assigned to ${role.userCount} user${role.userCount === 1 ? '' : 's'}`
                : 'Manage role details and permissions.'}
            </p>
          </div>
        </div>

        {role && !role.isSystem ? (
          <Button
            variant="destructive"
            className="gap-2"
            disabled={deleteMut.isPending || (role.userCount ?? 0) > 0}
            onClick={() => {
              void confirmDelete({
                title: 'Delete role',
                description: `Delete role "${role.name}"? This cannot be undone.`,
              }).then((confirmed) => {
                if (!confirmed) return
                deleteMut.mutate(role.id, {
                  onSuccess: () => router.push('/admin/roles'),
                })
              })
            }}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
          <CardDescription>
            {role?.isSystem
              ? 'Built-in role — name is locked, but you can still adjust description and permissions.'
              : 'Edit the role name, description, and permissions.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : err ? (
            <p className="text-sm text-destructive">{(err as Error).message}</p>
          ) : role ? (
            <RoleForm
              mode="edit"
              initial={role}
              allPermissions={permsQuery.data ?? []}
              submitting={updateMut.isPending}
              onCancel={() => router.push('/admin/roles')}
              onSubmit={async (value) => {
                await updateMut.mutateAsync({
                  id: role.id,
                  body: {
                    name: role.isSystem ? undefined : value.name,
                    description: value.description,
                    permissions: value.permissions,
                  },
                })
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
