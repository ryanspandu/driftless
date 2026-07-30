import { test } from '@japa/runner'
import {
  exponentOf,
  formatMajor,
  minorToMajorString,
  parseMajorToMinor,
} from '../ui/lib/money.js'

/**
 * How money is written, and — more importantly — how it is read back.
 *
 * `MoneyInput` shows two different renderings of the same amount: a grouped,
 * localised one while it rests, and a canonical one while it is being edited.
 * The split exists because localised *parsing* is ambiguous in a way that costs
 * real money, and these tests are what keep the two halves from being
 * accidentally merged by someone who thinks the duplication is redundant.
 *
 * Imported directly from the `ui/` tree, which is a separate tsconfig — safe
 * here because `money.ts` is pure and imports nothing.
 */

test.group('Money | display formatting', () => {
  test('groups thousands the way the locale does', ({ assert }) => {
    assert.equal(formatMajor(600_000_000, 'IDR', 'en-US'), '6,000,000.00')
    assert.equal(formatMajor(600_000_000, 'IDR', 'id-ID'), '6.000.000,00')
    assert.equal(formatMajor(1999, 'EUR', 'de-DE'), '19,99')
  })

  test('honours the currency exponent, not a hardcoded 2', ({ assert }) => {
    // Yen has no minor unit at all; a trailing ".00" would be wrong, not merely ugly.
    assert.equal(exponentOf('JPY'), 0)
    assert.equal(formatMajor(123_456, 'JPY', 'ja-JP'), '123,456')

    // Dinar has three.
    assert.equal(exponentOf('KWD'), 3)
    assert.equal(formatMajor(1_234_567, 'KWD', 'en-US'), '1,234.567')
  })

  test('carries no currency symbol', ({ assert }) => {
    /**
     * The input renders the symbol as a separate prefix. If this included one
     * too, every field would read "IDR IDR 6,000,000.00".
     */
    const formatted = formatMajor(1999, 'USD', 'en-US')
    assert.notInclude(formatted, '$')
    assert.notInclude(formatted, 'USD')
  })

  test('an unknown currency code does not throw inside a render', ({ assert }) => {
    assert.equal(formatMajor(1999, 'ZZZ', 'en-US'), '19.99')
  })
})

test.group('Money | entry stays canonical', () => {
  test('what the input shows while focused parses back to the same integer', ({ assert }) => {
    const cases: [number, string][] = [
      [600_000_000, 'IDR'],
      [1999, 'USD'],
      [123_456, 'JPY'],
      [1_234_567, 'KWD'],
      [-4500, 'USD'],
      [0, 'USD'],
    ]

    for (const [amount, currency] of cases) {
      const typed = minorToMajorString(amount, currency)
      assert.equal(
        parseMajorToMinor(typed, currency),
        amount,
        `${currency} ${amount} did not survive the round trip (via "${typed}")`
      )
    }
  })

  test('a localised string is NOT a valid entry string — which is the whole point', ({
    assert,
  }) => {
    /**
     * This is the hazard the two-rendering split exists to prevent, stated as a
     * test so it cannot be quietly "simplified" away.
     *
     * Under `id-ID` six million is written "6.000.000,00". Feeding that to the
     * parser — which reads `.` as a decimal point, because that is what the
     * canonical form uses — does not fail loudly. It would silently produce a
     * different amount, on a field that decides what someone is charged.
     */
    const localised = formatMajor(600_000_000, 'IDR', 'id-ID')
    assert.equal(localised, '6.000.000,00')
    assert.notEqual(parseMajorToMinor(localised, 'IDR'), 600_000_000)

    // The canonical form, by contrast, is exact.
    assert.equal(parseMajorToMinor(minorToMajorString(600_000_000, 'IDR'), 'IDR'), 600_000_000)
  })

  test('half-typed input holds the last value rather than emitting a bogus one', ({ assert }) => {
    for (const partial of ['', '-', '.', 'abc']) {
      assert.isNull(parseMajorToMinor(partial, 'USD'), `"${partial}" should not parse`)
    }

    // "19." is someone mid-decimal, and is a real number as far as we care.
    assert.equal(parseMajorToMinor('19.', 'USD'), 1900)
  })

  test('parsing never goes through a float', ({ assert }) => {
    /**
     * `19.99 * 100` is `1998.9999999999998`. Walking the string is what makes
     * this exact, and it is worth a regression test because the naive version
     * looks correct in casual testing.
     */
    assert.equal(parseMajorToMinor('19.99', 'USD'), 1999)
    assert.equal(parseMajorToMinor('0.07', 'USD'), 7)
    assert.equal(parseMajorToMinor('8.29', 'USD'), 829)
  })
})
