import type { ComponentType, ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

/**
 * The one bulk-action bar every list page shows when rows are checked: the
 * count on the left; on the right a ghost "Clear" then the page's actions.
 *
 * ```tsx
 * <BulkActionBar count={n} noun="product" onClear={() => setSelection({})}>
 *   <BulkDeleteButton busy={bulk.isPending} onClick={onBulkDelete} />
 * </BulkActionBar>
 * ```
 *
 * A destructive bulk action is always labelled "Delete" with a trash icon — even
 * when it is a soft delete the Trash can undo — so every page reads the same.
 */
export function BulkActionBar({
  count,
  noun,
  plural = `${noun}s`,
  detail,
  onClear,
  children,
  className,
}: {
  count: number
  /** Singular noun for the selected rows ("product"). */
  noun: string
  plural?: string
  /** Extra text after the count, e.g. a payout total. */
  detail?: ReactNode
  onClear: () => void
  /** The page's actions, rendered after "Clear". */
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3',
        className
      )}
    >
      <p className="text-sm">
        <span className="font-medium">{count}</span> {count === 1 ? noun : plural} selected
        {detail ? <> · {detail}</> : null}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
        {children}
      </div>
    </div>
  )
}

/** An action in a {@link BulkActionBar}: small outline button, optional icon, red when destructive. */
export function BulkAction({
  icon: Icon,
  destructive,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size' | 'variant'> & {
  icon?: ComponentType<{ className?: string }>
  destructive?: boolean
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      {...props}
      className={cn('gap-2', destructive && 'text-destructive', props.className)}
    >
      {Icon ? <Icon className="size-4" /> : null}
      {children}
    </Button>
  )
}

/** The standard bulk "Delete" — trash icon, red, "Deleting…" while it runs. */
export function BulkDeleteButton({
  onClick,
  busy,
  label = 'Delete',
  busyLabel = 'Deleting…',
  disabled,
}: {
  onClick: () => void
  busy?: boolean
  label?: string
  busyLabel?: string
  disabled?: boolean
}) {
  return (
    <BulkAction destructive icon={Trash2} disabled={busy || disabled} onClick={onClick}>
      {busy ? busyLabel : label}
    </BulkAction>
  )
}
