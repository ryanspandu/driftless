import * as React from 'react'
import { cn } from '~/lib/utils'
import {
  currencySymbol,
  formatMajor,
  minorToMajorString,
  parseMajorToMinor,
} from '../lib/money'
import type { Minor } from '../lib/money'
import { useStoreLocale } from '../admin/_api'

export interface MoneyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  /** Amount in minor units (cents). The canonical value. */
  value: Minor | null
  /** ISO 4217 code, used for the symbol and the number of decimals. */
  currency: string
  /** Fires with minor units, or `null` while the field is empty. */
  onChange: (value: Minor | null) => void
  /**
   * Overrides the store's locale for the symbol and the grouping.
   *
   * Rarely needed. Defaulting to the store setting rather than requiring it is
   * deliberate: the prop existed before and **no call site ever passed it**, so
   * every field silently formatted against the browser's locale while the totals
   * beside them used the store's. One forgotten prop is invisible; a default
   * cannot be forgotten.
   */
  locale?: string
}

/**
 * Currency entry bound to an integer minor-unit value.
 *
 * The component keeps its own text state while the field has focus, so someone
 * can type "19." or clear the box without the value snapping underneath them.
 *
 * ## Two renderings, on purpose
 *
 * **Resting** it shows the number the way the rest of the page writes money —
 * grouped for the store's locale, "6,000,000.00". Anything else makes a field
 * and the total underneath it disagree about the same amount, which is what
 * this fixes.
 *
 * **Focused** it switches to the canonical form: a plain `.` decimal and no
 * grouping. That is not laziness about caret handling, it is a correctness
 * boundary. Locale-aware *parsing* is ambiguous in a way that costs money —
 * under `id-ID` the string "19.99" means nineteen thousand nine hundred and
 * ninety, and under `en-US` it means nineteen and change. `parseMajorToMinor`
 * therefore never sees a localised string: what someone types is always read
 * the one way, and the grouped form exists only for reading.
 *
 * A plain `<input type="number">` was not an option either: its value is a
 * float, and float cents are exactly the bug this codebase is set up to avoid.
 *
 * ## Admin only
 *
 * It reads the store's locale through `useStoreLocale()`, which calls an
 * authenticated admin endpoint. Rendering this on a storefront page would 401,
 * and the shared response interceptor turns a 401 into a redirect to `/login` —
 * so a money input dropped into the shop would log the *customer* out. Every
 * current use is in `ui/admin/`. If a storefront one is ever needed, pass
 * `locale` explicitly and lift the hook out.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, currency, onChange, locale, className, disabled, ...props }, ref) => {
    const storeLocale = useStoreLocale()
    const activeLocale = locale ?? storeLocale

    /** How the number reads when nobody is editing it. */
    const display = React.useCallback(
      (amount: Minor | null) => (amount === null ? '' : formatMajor(amount, currency, activeLocale)),
      [currency, activeLocale]
    )

    /** How the number reads while it is being edited — parser-safe. */
    const canonical = React.useCallback(
      (amount: Minor | null) => (amount === null ? '' : minorToMajorString(amount, currency)),
      [currency]
    )

    const [text, setText] = React.useState(() => display(value))
    const [focused, setFocused] = React.useState(false)

    // Track external updates (a form reset, a server round-trip) but never
    // while the field is being edited.
    React.useEffect(() => {
      if (focused) return
      setText(display(value))
    }, [value, display, focused])

    const symbol = React.useMemo(
      () => currencySymbol(currency, activeLocale),
      [currency, activeLocale]
    )

    return (
      <div className={cn('relative', className)}>
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
        >
          {symbol}
        </span>
        <input
          ref={ref}
          // `inputMode` gets the numeric keypad on mobile without the float
          // semantics (and spinners) of `type="number"`.
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={text}
          onFocus={(e) => {
            setFocused(true)
            // Drop the grouping the moment editing starts, so what is in the box
            // is always what the parser expects to read back.
            setText(canonical(value))
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            setText(display(value))
            props.onBlur?.(e)
          }}
          onChange={(e) => {
            const next = e.target.value
            setText(next)

            if (next.trim() === '') {
              onChange(null)
              return
            }

            const minor = parseMajorToMinor(next, currency)
            // `null` means "not a number yet" (e.g. someone typed just "-").
            // Hold the last committed value rather than emitting a bogus one.
            if (minor !== null) onChange(minor)
          }}
          className={cn(
            'flex h-9 w-full rounded-lg border border-border bg-background py-1 pr-3 text-sm shadow-sm transition-colors',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50 tabular-nums',
            // Leave room for the symbol prefix.
            symbol.length > 1 ? 'pl-12' : 'pl-7'
          )}
          {...props}
        />
      </div>
    )
  }
)
MoneyInput.displayName = 'MoneyInput'
