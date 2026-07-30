import { ComboboxInput } from '~/components/ui/combobox-input'
import { useCities } from '../hooks/use-cities'

export interface CityInputProps {
  value: string
  onChange: (value: string) => void
  /** ISO 3166-1 alpha-2. Suggestions are scoped to it; empty means none. */
  country: string | null | undefined
  id?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * How many suggestions the menu shows at once.
 *
 * The United States alone has 11,828 names in the dataset, and each one drawn
 * is a DOM node. Fifty fills the visible menu twice over; anything past that is
 * scrolled past, never read, and paid for on every keystroke. The menu says how
 * many it is holding back.
 */
const MAX_VISIBLE = 50

/**
 * A city field with suggestions, scoped to the chosen country.
 *
 * **Free text, always.** The list is help, not a gate. The underlying data
 * stops at places of 1,000 inhabitants, so villages, hamlets and anything newly
 * built are missing from it — Indonesia alone has tens of thousands of
 * *desa* below that line. A picker that refused an unlisted name would be a
 * checkout nobody in a small village could complete, which is a far worse
 * failure than an unaided text box.
 *
 * Suggestions arrive in population order and that order is preserved, so
 * typing "ja" in Indonesia offers Jakarta before Jailolo.
 */
export function CityInput({
  value,
  onChange,
  country,
  id,
  name,
  placeholder = 'Start typing a city…',
  disabled,
  className,
}: CityInputProps) {
  const cities = useCities(country)

  return (
    <ComboboxInput
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      options={cities}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      preserveOrder
      maxVisible={MAX_VISIBLE}
      /**
       * "Use" rather than the default "Create": nothing is being created here.
       * The buyer is telling us where they live, and the only honest reading of
       * a name we do not hold is that our list is short, not that theirs is
       * wrong.
       */
      createLabel="Use"
      emptyLabel={country ? 'No match — type it in full' : 'Choose a country first'}
    />
  )
}
