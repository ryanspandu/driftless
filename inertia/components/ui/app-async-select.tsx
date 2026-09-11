import AsyncSelect from 'react-select/async'
import type { GroupBase } from 'react-select'
import { selectPresentation, RsCacheProvider, type AppSelectOption } from './app-select'

/**
 * Async, server-searched variant of {@link AppSelect} — same look, but options
 * are loaded from a backend as the user types (Select2-style). Use when the full
 * option set is too large to ship to the client (e.g. picking an account).
 */
export function AppAsyncSelect({
  value,
  onChange,
  loadOptions,
  placeholder = 'Search…',
  disabled,
  noOptionsMessage,
}: {
  value: AppSelectOption | null
  onChange: (opt: AppSelectOption | null) => void
  loadOptions: (input: string) => Promise<AppSelectOption[]>
  placeholder?: string
  disabled?: boolean
  noOptionsMessage?: string
}) {
  return (
    <RsCacheProvider>
      <AsyncSelect<AppSelectOption, false, GroupBase<AppSelectOption>>
        cacheOptions
        defaultOptions
        value={value}
        onChange={(opt) => onChange(opt ?? null)}
        loadOptions={loadOptions}
        placeholder={placeholder}
        isDisabled={disabled}
        isClearable
        loadingMessage={() => 'Searching…'}
        noOptionsMessage={() => noOptionsMessage ?? 'No matches'}
        {...selectPresentation<false>({})}
      />
    </RsCacheProvider>
  )
}
