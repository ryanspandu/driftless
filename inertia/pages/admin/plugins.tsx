import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Plug2 } from 'lucide-react'
import type { PluginDto } from '~/types/api'
import { Badge } from '~/components/ui/badge'
import { Switch } from '~/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { usePluginsList, useTogglePlugin } from '~/hooks/api/use-plugins'

export default function PluginsPage() {
  const pluginsQuery = usePluginsList()
  const toggle = useTogglePlugin()
  const items = useMemo(() => pluginsQuery.data ?? [], [pluginsQuery.data])

  const columns = useMemo<ColumnDef<PluginDto, unknown>[]>(
    () => [
      {
        id: 'plugin',
        accessorFn: (r) => r.label,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Plugin" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg border bg-primary/5 text-muted-foreground">
              <Plug2 className="size-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-medium">{row.original.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{row.original.name}</span>
            </div>
          </div>
        ),
      },
      {
        id: 'description',
        accessorFn: (r) => r.description,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.description}</span>
        ),
      },
      {
        id: 'version',
        accessorFn: (r) => r.version,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Version" />,
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-[10px]">
            v{row.original.version}
          </Badge>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => (r.enabled ? 'active' : 'inactive'),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? 'default' : 'secondary'}>
            {row.original.enabled ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        id: 'active',
        enableSorting: false,
        header: () => <span className="text-xs font-medium">Active</span>,
        cell: ({ row }) => {
          const r = row.original
          const isPending = toggle.isPending && toggle.variables?.name === r.name
          return (
            <Switch
              checked={r.enabled}
              disabled={isPending}
              onCheckedChange={(enabled) => toggle.mutate({ name: r.name, enabled })}
            />
          )
        },
      },
    ],
    [toggle]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plugins</h1>
        <p className="text-sm text-muted-foreground">
          Enable or disable installed plugins. Disabling immediately hides a plugin from the menu
          and blocks its routes — its data is kept and restored when re-enabled.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Installed plugins</CardTitle>
          <CardDescription>
            {pluginsQuery.isLoading
              ? 'Loading plugins…'
              : `${items.length} plugin${items.length === 1 ? '' : 's'} detected.`}
            {pluginsQuery.error ? (
              <span className="text-destructive"> · {(pluginsQuery.error as Error).message}</span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={items}
            getRowId={(r) => r.name}
            searchPlaceholder="Search plugins…"
            hideSyncColumn
            enableBulkSelect={false}
            urlSync={{}}
            emptyMessage={pluginsQuery.isLoading ? 'Loading plugins…' : 'No plugins installed.'}
          />
        </CardContent>
      </Card>
    </div>
  )
}
