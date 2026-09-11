import { useMemo } from 'react'
import { AppSelect } from '~/components/ui/app-select'
import { countryOptions } from '../lib/countries'

export interface CountrySelectProps {
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Offer a blank choice — for optional addresses that may be left empty. */
  clearable?: boolean
  'aria-invalid'?: boolean
}

/**
 * A searchable country picker, every ISO 3166-1 country in it.
 *
 * A **closed** list, unlike the city field beside it. The set of countries is
 * finite, known and stable, and the stored value feeds exact-match lookups —
 * shipping zones compare country codes as strings, so a free-typed "Indonsia"
 * or a stray lowercase "id" would quote no shipping rate at all and read as a
 * broken store rather than a typo.
 *
 * Searching matches the country's **name**, not its code, because nobody
 * remembers that Indonesia is `ID` and Switzerland is `CH`. The value stored is
 * still the code.
 */
export function CountrySelect({
  value,
  onChange,
  id,
  placeholder = 'Search a country…',
  disabled,
  className,
  clearable = false,
  'aria-invalid': invalid,
}: CountrySelectProps) {
  const code = (value ?? '').trim().toUpperCase()

  /**
   * A stored code we do not recognise is shown as itself rather than dropped.
   *
   * These fields used to be free text, so a database can hold `UK`, `EN` or a
   * typo from before this picker existed. `AppSelect` resolves its display by
   * finding the value among the options, so an unmatched one renders as the
   * *placeholder* — the field reads as empty while still holding the bad code,
   * and the operator cannot see what to fix. With the server now rejecting
   * unknown codes, that combination is a save that fails against a field that
   * looks blank. Surfacing the code makes the problem legible instead.
   */
  const options = useMemo(() => {
    const all = countryOptions()
    if (!code || all.some((o) => o.value === code)) return all
    return [{ value: code, label: `${code} — not a known country` }, ...all]
  }, [code])

  return (
    <AppSelect
      id={id}
      value={code}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      isClearable={clearable}
      controlClassName={className}
      aria-invalid={invalid}
    />
  )
}
