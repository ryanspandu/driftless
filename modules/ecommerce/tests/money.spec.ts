import { test } from '@japa/runner'
import {
  Money,
  MoneyError,
  allocate,
  applyPercent,
  atLeastZero,
  exponentOf,
  format,
  fromMajor,
  multiply,
  sum,
  toDto,
  toMajor,
} from '#modules/ecommerce/services/money'

test.group('Money | exponentOf', () => {
  test('defaults to two decimals', ({ assert }) => {
    assert.equal(exponentOf('USD'), 2)
    assert.equal(exponentOf('EUR'), 2)
    assert.equal(exponentOf('IDR'), 2)
  })

  test('knows the zero- and three-decimal exceptions', ({ assert }) => {
    assert.equal(exponentOf('JPY'), 0)
    assert.equal(exponentOf('KRW'), 0)
    assert.equal(exponentOf('KWD'), 3)
  })

  test('is case insensitive', ({ assert }) => {
    assert.equal(exponentOf('jpy'), 0)
  })

  test('rejects anything that is not an ISO 4217 code', ({ assert }) => {
    assert.throws(() => exponentOf('US'), MoneyError)
    assert.throws(() => exponentOf('DOLLAR'), MoneyError)
    assert.throws(() => exponentOf(''), MoneyError)
  })
})

test.group('Money | fromMajor', () => {
  test('parses the common cases exactly', ({ assert }) => {
    assert.equal(fromMajor('19.99', 'USD'), 1999)
    assert.equal(fromMajor('0.01', 'USD'), 1)
    assert.equal(fromMajor('0', 'USD'), 0)
    assert.equal(fromMajor('1000', 'USD'), 100_000)
  })

  test('does not go through floating point', ({ assert }) => {
    // The naive `Number('19.99') * 100` is 1998.9999999999998. This is the
    // single most important assertion in the file.
    assert.equal(fromMajor('19.99', 'USD'), 1999)
    assert.equal(fromMajor('0.29', 'USD'), 29)
    assert.equal(fromMajor('1.005', 'USD'), 101)
  })

  test('honours the currency exponent', ({ assert }) => {
    assert.equal(fromMajor('1000', 'JPY'), 1000)
    assert.equal(fromMajor('1.234', 'KWD'), 1234)
  })

  test('rounds a longer fraction half-up', ({ assert }) => {
    assert.equal(fromMajor('1.004', 'USD'), 100)
    assert.equal(fromMajor('1.005', 'USD'), 101)
    assert.equal(fromMajor('1.006', 'USD'), 101)
  })

  test('pads a short fraction', ({ assert }) => {
    assert.equal(fromMajor('1.5', 'USD'), 150)
    assert.equal(fromMajor('1.50', 'USD'), 150)
  })

  test('rejects a trailing separator with no digits after it', ({ assert }) => {
    assert.throws(() => fromMajor('1.', 'USD'), MoneyError)
  })

  test('handles negatives', ({ assert }) => {
    assert.equal(fromMajor('-19.99', 'USD'), -1999)
  })

  test('accepts a number and pins it to the exponent', ({ assert }) => {
    assert.equal(fromMajor(19.99, 'USD'), 1999)
    assert.equal(fromMajor(0.1 + 0.2, 'USD'), 30)
  })

  test('rejects junk', ({ assert }) => {
    assert.throws(() => fromMajor('abc', 'USD'), MoneyError)
    assert.throws(() => fromMajor('1.2.3', 'USD'), MoneyError)
    assert.throws(() => fromMajor('', 'USD'), MoneyError)
    assert.throws(() => fromMajor('1,99', 'USD'), MoneyError)
  })
})

test.group('Money | toMajor', () => {
  test('renders with the right number of decimals', ({ assert }) => {
    assert.equal(toMajor(1999, 'USD'), '19.99')
    assert.equal(toMajor(1, 'USD'), '0.01')
    assert.equal(toMajor(0, 'USD'), '0.00')
    assert.equal(toMajor(100_000, 'USD'), '1000.00')
  })

  test('renders zero-decimal currencies without a separator', ({ assert }) => {
    assert.equal(toMajor(1000, 'JPY'), '1000')
  })

  test('renders three-decimal currencies', ({ assert }) => {
    assert.equal(toMajor(1234, 'KWD'), '1.234')
  })

  test('renders negatives', ({ assert }) => {
    assert.equal(toMajor(-1999, 'USD'), '-19.99')
    assert.equal(toMajor(-1, 'USD'), '-0.01')
  })

  test('round-trips with fromMajor', ({ assert }) => {
    for (const amount of [0, 1, 99, 100, 1999, 123_456, -1999]) {
      assert.equal(fromMajor(toMajor(amount, 'USD'), 'USD'), amount)
    }
  })

  test('rejects a non-integer amount', ({ assert }) => {
    assert.throws(() => toMajor(19.99, 'USD'), MoneyError)
    assert.throws(() => toMajor(Number.NaN, 'USD'), MoneyError)
  })
})

test.group('Money | format', () => {
  test('produces a localised display string', ({ assert }) => {
    assert.equal(format(1999, 'USD'), '$19.99')
    assert.equal(format(0, 'USD'), '$0.00')
  })

  test('respects a zero-decimal currency', ({ assert }) => {
    assert.equal(format(1000, 'JPY'), '¥1,000')
  })
})

test.group('Money | sum and multiply', () => {
  test('sums exactly', ({ assert }) => {
    assert.equal(sum(1999, 1, 100), 2100)
    assert.equal(sum(), 0)
    assert.equal(sum(-100, 100), 0)
  })

  test('multiplies by a quantity', ({ assert }) => {
    assert.equal(multiply(1999, 3), 5997)
    assert.equal(multiply(1999, 0), 0)
  })

  test('rejects a non-integer or negative quantity', ({ assert }) => {
    assert.throws(() => multiply(1999, 1.5), MoneyError)
    assert.throws(() => multiply(1999, -1), MoneyError)
  })

  test('rejects non-integer inputs', ({ assert }) => {
    assert.throws(() => sum(19.99), MoneyError)
    assert.throws(() => multiply(19.99, 2), MoneyError)
  })
})

test.group('Money | applyPercent', () => {
  test('computes ordinary percentages', ({ assert }) => {
    assert.equal(applyPercent(10_000, 10), 1000)
    assert.equal(applyPercent(1999, 100), 1999)
    assert.equal(applyPercent(1999, 0), 0)
  })

  test('handles fractional tax rates', ({ assert }) => {
    // 8.25% of $19.99 is 1.649175 → 165 cents half-up.
    assert.equal(applyPercent(1999, 8.25), 165)
    // 7.5% of $10.00 is exactly 75 cents.
    assert.equal(applyPercent(1000, 7.5), 75)
  })

  test('rounds half-up at the boundary', ({ assert }) => {
    // 50% of 5 cents is 2.5 → 3.
    assert.equal(applyPercent(5, 50), 3)
    // 50% of 3 cents is 1.5 → 2.
    assert.equal(applyPercent(3, 50), 2)
    // 50% of 4 cents is exactly 2.
    assert.equal(applyPercent(4, 50), 2)
  })

  test('rounds away from zero for negatives', ({ assert }) => {
    assert.equal(applyPercent(-5, 50), -3)
  })

  test('rejects a non-finite percent', ({ assert }) => {
    assert.throws(() => applyPercent(1000, Number.NaN), MoneyError)
    assert.throws(() => applyPercent(1000, Number.POSITIVE_INFINITY), MoneyError)
  })
})

test.group('Money | allocate', () => {
  test('never loses or invents a minor unit', ({ assert }) => {
    const parts = allocate(100, [1, 1, 1])
    assert.deepEqual(parts, [34, 33, 33])
    assert.equal(sum(...parts), 100)
  })

  test('weights by the given ratios', ({ assert }) => {
    const parts = allocate(1000, [3, 1])
    assert.deepEqual(parts, [750, 250])
    assert.equal(sum(...parts), 1000)
  })

  test('is exact for an awkward split', ({ assert }) => {
    // A $10.00 order discount over three lines priced 5.00 / 3.33 / 1.67.
    const parts = allocate(1000, [500, 333, 167])
    assert.equal(sum(...parts), 1000)
    assert.deepEqual(parts, [500, 333, 167])
  })

  test('gives the remainder to the largest fractional parts', ({ assert }) => {
    const parts = allocate(10, [1, 1, 1])
    assert.equal(sum(...parts), 10)
    assert.deepEqual(parts, [4, 3, 3])
  })

  test('is deterministic across repeated calls', ({ assert }) => {
    const first = allocate(101, [1, 1, 1, 1, 1, 1, 1])
    const second = allocate(101, [1, 1, 1, 1, 1, 1, 1])
    assert.deepEqual(first, second)
    assert.equal(sum(...first), 101)
  })

  test('handles a zero total by giving everything to the first slot', ({ assert }) => {
    const parts = allocate(500, [0, 0, 0])
    assert.deepEqual(parts, [500, 0, 0])
    assert.equal(sum(...parts), 500)
  })

  test('handles a zero amount', ({ assert }) => {
    assert.deepEqual(allocate(0, [1, 2]), [0, 0])
  })

  test('rejects empty or invalid ratios', ({ assert }) => {
    assert.throws(() => allocate(100, []), MoneyError)
    assert.throws(() => allocate(100, [1, -1]), MoneyError)
    assert.throws(() => allocate(100, [1, Number.NaN]), MoneyError)
  })
})

test.group('Money | atLeastZero', () => {
  test('clamps negatives so a discount cannot invert a line', ({ assert }) => {
    assert.equal(atLeastZero(-500), 0)
    assert.equal(atLeastZero(0), 0)
    assert.equal(atLeastZero(500), 500)
  })
})

test.group('Money | toDto', () => {
  test('carries the amount, the currency and a rendered string', ({ assert }) => {
    assert.deepEqual(toDto(1999, 'usd'), {
      amount: 1999,
      currency: 'USD',
      formatted: '$19.99',
    })
  })
})

test.group('Money | namespace export', () => {
  test('exposes the same functions', ({ assert }) => {
    assert.equal(Money.fromMajor('19.99', 'USD'), 1999)
    assert.equal(Money.toMajor(1999, 'USD'), '19.99')
    assert.equal(Money.applyPercent(1999, 10), 200)
  })
})
