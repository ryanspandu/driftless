import { useId, useMemo } from 'react'
import ReactSelect, { type MultiValue } from 'react-select'
import { selectPresentation, type AppSelectOption } from '~/components/ui/app-select'
import { countryOptions } from '../lib/countries'

export interface CountryMultiSelectProps {
  /** ISO 3166-1 alpha-2 codes, in the order the operator picked them. */
  value: string[]
  onChange: (value: string[]) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  'aria-invalid'?: boolean
}

/**
 * Picks any number of countries — for shipping zones and anything else keyed on
 * a set of destinations.
 *
 * This replaced a comma-separated text box, and the reason is worth keeping.
 * Zone matching compares the destination's country code to these strings
 * exactly, so `UK` instead of `GB`, or `GBR`, or a trailing space, matched
 * nothing — and matching nothing does not raise an error. It quotes no shipping
 * rate, which reads as a broken checkout rather than a mistyped setting, and
 * the operator has no way to tell the two apart. A closed list removes the
 * failure instead of reporting it.
 */
export function CountryMultiSelect({
  value,
  onChange,
  id,
  placeholder = 'Search countries…',
  disabled,
  'aria-invalid': invalid,
}: CountryMultiSelectProps) {
  const rid = useId()
  const inputId = id ?? `country-multi-${rid}`
  const instanceId = useMemo(() => inputId.replace(/[^a-zA-Z0-9_-]/g, ''), [inputId])

  const options = useMemo(() => countryOptions(), [])

  /**
   * Selected chips are built from `value`, so a code the list does not know —
   * one already in the database from the free-text days — still shows up rather
   * than vanishing silently on the next save.
   *
   * It is labelled as unrecognised, not left as a bare code. The server now
   * rejects the whole save when a zone names one of these, and `onSave`
   * resubmits every zone, so an operator editing an unrelated zone can be
   * blocked by a chip elsewhere on the page. Saying which chip is the problem
   * is the difference between a fixable error and a stuck form.
   */
  const selected = useMemo(
    () =>
      value.map(
        (code) =>
          options.find((o) => o.value === code) ?? {
            value: code,
            label: `${code} — not a known country`,
          }
      ),
    [value, options]
  )

  return (
    <ReactSelect<AppSelectOption, true>
      inputId={inputId}
      instanceId={instanceId}
      isMulti
      value={selected}
      onChange={(opts: MultiValue<AppSelectOption>) => onChange(opts.map((o) => o.value))}
      options={options}
      placeholder={placeholder}
      isDisabled={disabled}
      closeMenuOnSelect={false}
      {...selectPresentation<true>({ invalid })}
    />
  )
}
