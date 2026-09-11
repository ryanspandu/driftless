import {
  flattenOptions,
  type AppSelectOption,
  type AppSelectOptions,
} from '~/components/ui/app-select'

/** Above this many options a panel select gets a typeahead. */
export const SEARCH_THRESHOLD = 8

/**
 * The options a panel select shows: `emptyLabel` adds a `''` row up front
 * unless one already exists (many CSS-enum option lists carry their own).
 */
export function panelSelectOptions(
  options: AppSelectOptions,
  emptyLabel: string | undefined
): AppSelectOptions {
  if (!emptyLabel) return options
  if (flattenOptions(options).some((o) => o.value === '')) return options
  const empty: AppSelectOption = { value: '', label: emptyLabel }
  return [empty, ...(options as AppSelectOption[])] as AppSelectOptions
}

export function autoSearchable(options: AppSelectOptions): boolean {
  return flattenOptions(options).length > SEARCH_THRESHOLD
}
