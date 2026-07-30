import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Download, MoreHorizontal, Trash2 } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { Switch } from '~/components/ui/switch'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useAbility } from '~/components/providers/ability-provider'
import type { ModuleDto } from '~/types/api'

/**
 * The installed-modules table, shared by the Apps and Plugins tabs.
 *
 * Extracted from the page because six columns with a dropdown cell is ~140
 * lines on its own — inlined, the page's own structure disappears underneath
 * the column definitions.
 *
 * It lives in `components/` rather than beside the page on purpose: the glob in
 * `inertia/app.tsx` turns **every** file under `inertia/pages/` into an Inertia
 * page, so a helper placed there would be routable.
 */

export interface ModulesTableProps {
  modules: ModuleDto[]
  isLoading: boolean
  /** Distinguishes the two tabs' table state in the URL (`apps_q`, `plugins_sort`, …). */
  paramPrefix: string
  emptyMessage: string
  /** Name of the module whose toggle is mid-flight, if any. */
  togglingName?: string
  /** An install is already running — the row action stands down while it does. */
  installBusy: boolean
  onToggle: (module: ModuleDto, enabled: boolean) => void
  onInstall: (module: ModuleDto) => void
  onUninstall: (module: ModuleDto) => void
}

export function ModulesTable({
  modules,
  isLoading,
  paramPrefix,
  emptyMessage,
  togglingName,
  installBusy,
  onToggle,
  onInstall,
  onUninstall,
}: ModulesTableProps) {
  /**
   * Read as values rather than wrapping menu items in `<Can>`: a dropdown whose
   * only child is a permission-gated fragment still renders an empty popover.
   */
  const { permissions } = useAbility()
  const canInstall = permissions.has('module:install')
  const canUninstall = permissions.has('module:uninstall')

  const columns = useMemo<ColumnDef<ModuleDto>[]>(
    () => [
      {
        id: 'module',
        accessorFn: (m) => m.label,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Module" />,
        /**
         * Primary cell: label over folder name. The folder name earns the
         * secondary slot because it is what the operator sees on disk and what
         * the uninstall dialog asks them to type.
         */
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.name}</span>
          </div>
        ),
      },
      {
        id: 'description',
        accessorFn: (m) => m.description,
        enableSorting: false,
        header: 'Description',
        cell: ({ row }) => (
          // Clamped so one long description cannot set the height of every row.
          <span className="line-clamp-1 max-w-[420px] text-sm text-muted-foreground">
            {row.original.description}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (m) => (!m.schemaReady ? 'setup' : m.enabled ? 'enabled' : 'disabled'),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        /**
         * Sortable, and that is the main thing the table buys over the old
         * stacked rows: "show me everything that needs setting up" becomes one
         * click on a header instead of scanning for a badge.
         */
        cell: ({ row }) => {
          const m = row.original
          if (!m.schemaReady) return <Badge variant="warning">Setup required</Badge>
          return (
            <Badge variant={m.enabled ? 'success' : 'secondary'}>
              {m.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          )
        },
      },
      {
        id: 'version',
        accessorFn: (m) => m.version,
        /**
         * Deliberately not sortable. TanStack would compare these as strings,
         * so `10.0.0` would sort before `9.0.0` — a sort that is quietly wrong
         * is worse than no sort, and pulling `semver` into the client bundle
         * for one column is not worth it.
         */
        enableSorting: false,
        header: 'Version',
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">{row.original.version}</span>
        ),
      },
      {
        id: 'enabled',
        enableSorting: false,
        size: 88,
        header: 'Enabled',
        cell: ({ row }) => {
          const m = row.original
          return (
            <Switch
              checked={m.enabled}
              /**
               * A module with no tables cannot be switched on, so the control
               * says so rather than accepting the click and then explaining
               * itself with an error. The "Setup required" badge and the
               * Install action carry the message instead.
               */
              disabled={!m.schemaReady || togglingName === m.name}
              onCheckedChange={(enabled) => onToggle(m, enabled)}
              aria-label={`Enable ${m.label}`}
            />
          )
        },
      },
      {
        // `actions` is load-bearing: DataTable keys its sticky-right column off this id.
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const m = row.original
          const showInstall = canInstall && !m.schemaReady
          const showUninstall = canUninstall && m.schemaReady && m.canUninstall && !m.enabled

          if (!showInstall && !showUninstall) return null

          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="size-8" />}
                aria-label={`Actions for ${m.label}`}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {showInstall ? (
                  <DropdownMenuItem
                    className="gap-2"
                    disabled={installBusy}
                    onClick={() => onInstall(m)}
                  >
                    <Download className="size-4" />
                    Install
                  </DropdownMenuItem>
                ) : null}
                {showUninstall ? (
                  <DropdownMenuItem
                    variant="destructive"
                    className="gap-2"
                    onClick={() => onUninstall(m)}
                  >
                    <Trash2 className="size-4" />
                    Uninstall
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [canInstall, canUninstall, installBusy, togglingName, onToggle, onInstall, onUninstall]
  )

  return (
    <DataTable
      columns={columns}
      data={modules}
      /**
       * Modules take no part in the offline sync engine, so the default sync
       * column would put a green check on every row and "Last synced never" in
       * the toolbar — two confident statements about something that does not
       * apply.
       */
      hideSyncColumn
      /**
       * There is no bulk operation to reach: install is single-flight, uninstall
       * demands typing the module's name, and enabling is order-sensitive
       * because manifests declare `requires`. A checkbox with no bulk-action bar
       * promises a capability that does not exist — and the row already has a
       * Switch, so two clickable boxes meaning different things is worse still.
       */
      enableBulkSelect={false}
      searchPlaceholder="Search modules…"
      urlSync={{ paramPrefix }}
      emptyMessage={isLoading ? 'Loading…' : emptyMessage}
    />
  )
}
