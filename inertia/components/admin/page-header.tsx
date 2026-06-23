import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

export interface PageHeaderProps {
  /** Page title — the single source-of-truth heading for the page. */
  title: string
  /** Optional one-line description shown under the title. */
  subtitle?: ReactNode
  /** Optional total count rendered as a muted chip beside the title. */
  count?: number
  /** Right-aligned action slot (primary buttons, menus). */
  actions?: ReactNode
  className?: string
}

/**
 * Standard admin page header: title (+ optional count chip) and subtitle on the
 * left, actions on the right. This is the page's only <h1>; the top bar shows a
 * breadcrumb instead, so the title is no longer duplicated.
 */
export function PageHeader({ title, subtitle, count, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {count !== undefined && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
