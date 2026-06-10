
import { Link } from '@inertiajs/react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { PermissionForm } from '~/components/admin/permission-form'
import {
  useDeletePermission,
  usePermission,
  useUpdatePermission,
} from '~/hooks/api/use-permissions'
import { useRouter } from '~/hooks/use-inertia-url'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'

interface Props {
  permissionId: string
}

export default function EditPermissionPage({ permissionId }: Props) {
  const router = useRouter()
  const confirmDelete = useConfirmDelete()
  const query = usePermission(permissionId)
  const updateMut = useUpdatePermission()
  const deleteMut = useDeletePermission()

  const perm = query.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xl font-semibold tracking-tight">
                {perm?.name ?? 'Permission'}
              </h1>
              {perm?.isSystem ? <Badge variant="outline">system</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {perm?.roleCount != null
                ? `Used by ${perm.roleCount} role${perm.roleCount === 1 ? '' : 's'}`
                : 'Edit the permission metadata.'}
            </p>
          </div>
        </div>

        {perm && !perm.isSystem ? (
          <Button
            variant="destructive"
            className="gap-2"
            disabled={deleteMut.isPending}
            onClick={() => {
              void confirmDelete({
                title: 'Delete permission',
                description: `Delete permission "${perm.name}"? Any roles using it will lose it.`,
              }).then((confirmed) => {
                if (!confirmed) return
                deleteMut.mutate(perm.id, {
                  onSuccess: () => router.push('/admin/permissions'),
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
          <CardTitle>Permission details</CardTitle>
          <CardDescription>
            {perm?.isSystem
              ? 'Built-in or auto-generated — code is locked. Description can still be edited.'
              : 'Edit the code (carefully — any role using it keeps the old code) and description.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : query.error ? (
            <p className="text-sm text-destructive">{(query.error as Error).message}</p>
          ) : perm ? (
            <PermissionForm
              mode="edit"
              initial={perm}
              submitting={updateMut.isPending}
              onCancel={() => router.push('/admin/permissions')}
              onSubmit={async (value) => {
                await updateMut.mutateAsync({
                  id: perm.id,
                  body: {
                    name: perm.isSystem ? undefined : value.name,
                    description: value.description,
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
