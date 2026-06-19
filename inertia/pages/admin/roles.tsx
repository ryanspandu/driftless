
import { Link } from "@inertiajs/react";
import { useRouter } from "~/hooks/use-inertia-url";
import { useMemo } from "react";
import {
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { RoleDto } from "~/types/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown_menu";
import { DataTable, DataTableColumnHeader } from "~/components/data-table";
import { useDeleteRole, useRolesList } from "~/hooks/api/use-roles";
import { useAbility } from "~/components/providers/ability-provider";
import { useConfirmDelete } from "~/components/providers/delete-confirm-provider";
import { formatAdminTableDateTime } from "~/lib/utils";

export default function RolesPage() {
  
  const router = useRouter();
  const confirmDelete = useConfirmDelete();
  const { permissions } = useAbility();
  const canManage = permissions.has("role:manage");
  const rolesQuery = useRolesList( );
  const deleteMut = useDeleteRole( );

  const items = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const columns = useMemo<ColumnDef<RoleDto>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Role" />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border bg-primary/5 text-muted-foreground">
                {r.isSystem ? (
                  <Lock className="size-4" />
                ) : (
                  <Shield className="size-4" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/roles/${r.id}`}
                    className="font-medium text-ring hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.isSystem ? (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      system
                    </Badge>
                  ) : null}
                </div>
                {r.description ? (
                  <div className="line-clamp-1 text-xs text-muted-foreground">
                    {r.description}
                  </div>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        id: "permissions",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Permissions" />
        ),
        cell: ({ row }) => {
          const perms = row.original.permissions;
          const first = perms.slice(0, 4);
          const rest = perms.length - first.length;
          return (
            <div className="flex flex-wrap gap-1">
              {first.map((p) => (
                <Badge key={p} variant="outline" className="font-mono text-[10px]">
                  {p === "*" ? "*" : p}
                </Badge>
              ))}
              {rest > 0 ? (
                <Badge variant="secondary" className="text-[10px]">
                  +{rest} more
                </Badge>
              ) : null}
              {perms.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "users",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Users" />
        ),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.userCount ?? 0}
          </span>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Updated"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm text-muted-foreground tabular-nums">
            {formatAdminTableDateTime(row.original.updatedAt)}
          </div>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-8" />
                }
                aria-label="Row actions"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => router.push(`/admin/roles/${r.id}`)}
                >
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  className="gap-2"
                  disabled={r.isSystem || (r.userCount ?? 0) > 0}
                  onClick={() => {
                    if (!canManage) return;
                    if (r.isSystem) return;
                    void confirmDelete({
                      title: "Delete role",
                      description: `Delete role "${r.name}"? This cannot be undone.`,
                    }).then((confirmed) => {
                      if (confirmed) deleteMut.mutate(r.id);
                    });
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [canManage, confirmDelete, deleteMut, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles</h1>
          <p className="text-sm text-muted-foreground">
            Manage roles and the permissions assigned to them.
          </p>
        </div>
        {canManage ? (
          <Button className="gap-2" render={<Link href="/admin/roles/new" />}>
            <Plus className="size-4" />
            New role
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All roles</CardTitle>
          <CardDescription>
            {rolesQuery.isLoading
              ? "Loading…"
              : `${items.length} role${items.length === 1 ? "" : "s"}`}
            {rolesQuery.error ? (
              <span className="ml-2 text-destructive">
                · {(rolesQuery.error as Error).message}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            searchPlaceholder="Search roles…"
            urlSync={{}}
            emptyMessage={
              rolesQuery.isLoading
                ? "Loading roles…"
                : "No roles found."
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
