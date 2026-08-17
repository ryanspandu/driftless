import type { ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'

/**
 * The "All / Published / Drafts" filter that sits in a DataTable toolbar.
 *
 * This markup had been copy-pasted into twelve screens across core and the
 * modules, each maintaining its own copy of the same classes — so a change to
 * the look meant twelve edits, and in practice they had already begun to drift.
 *
 * It renders the design system's `Tabs` rather than restyling buttons: that
 * component already *is* this control (`inline-flex rounded-lg bg-muted p-1`,
 * active `bg-background shadow-sm`), and going through it means the admin has
 * one tab look instead of two that happen to match today. What this adds on top
 * is the count, which is the only reason the copies existed.
 */
export interface TableFilterOption<T extends string> {
  value: T
  label: string
  /** Rendered as a muted number after the label. Omit for no count. */
  count?: number
  /** Leading glyph, for view switchers like Board / List. `TabsTrigger` sizes it. */
  icon?: ReactNode
  /** Native tooltip, for filters whose label needs explaining. */
  hint?: string
}

export function TableFilterTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: readonly TableFilterOption<T>[]
  onChange: (value: T) => void
  /** Names the group for screen readers, e.g. "Filter by status". */
  ariaLabel?: string
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
      <TabsList aria-label={ariaLabel}>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value} title={option.hint}>
            {option.icon}
            {option.label}
            {option.count !== undefined ? (
              <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
