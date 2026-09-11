import { Suspense, lazy } from 'react'
import type { AppSelectOptions } from '~/components/ui/app-select'

/**
 * The builder panel's select: `AppSelect` at the panel's dense `h-7 text-xs`
 * size, with the two conventions every panel dropdown shares baked in.
 *
 * - `emptyLabel` prepends a `''` row ("Default", "Inherit", "— Static —") for
 *   CSS-enum pickers, where "unset" is a legitimate, visible choice. Entity
 *   pickers (collection, template) use `placeholder` + `isClearable` instead.
 * - `onChange` always yields a string; `''` means unset. Callers that store
 *   `null` do `v || null`, exactly as they did with `e.target.value || null`.
 *
 * Loaded lazily: the Collection List / Template Reference custom fields live in
 * files the public page bundle imports too, and react-select has no business
 * on a public page. The real component is in `panel-select-impl.tsx`; the
 * fallback keeps the row's height so the panel does not jump while it loads.
 *
 * Module-scope on purpose (see `collection-list.tsx`'s note on `FieldSelect`):
 * a select component defined inside another's render is a new type on every
 * render, which unmounts the open menu and drops focus on each keystroke.
 */
export interface PanelSelectProps {
  id?: string
  /** `''`, `null` and `undefined` all mean "nothing selected". */
  value: string | null | undefined
  onChange: (value: string) => void
  options: AppSelectOptions
  /** Adds a `''` option with this label unless the options already have one. */
  emptyLabel?: string
  placeholder?: string
  isClearable?: boolean
  /** Default: typeahead only when there are more than 8 options. */
  isSearchable?: boolean
  disabled?: boolean
  /** Container classes, e.g. a width (`w-28`). */
  className?: string
  /** Extra control classes, e.g. `text-builder-bound`. */
  controlClassName?: string
}

const PanelSelectImpl = lazy(() =>
  import('./panel-select-impl').then((m) => ({ default: m.PanelSelectImpl }))
)

export function PanelSelect(props: PanelSelectProps) {
  return (
    <Suspense
      fallback={
        <div
          className={
            props.className
              ? `h-7 rounded-md border border-input bg-background ${props.className}`
              : 'h-7 w-full rounded-md border border-input bg-background'
          }
        />
      }
    >
      <PanelSelectImpl {...props} />
    </Suspense>
  )
}
