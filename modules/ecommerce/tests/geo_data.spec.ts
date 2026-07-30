import { test } from '@japa/runner'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import {
  COUNTRY_CODES,
  isKnownCountry,
  normaliseCountry,
} from '#modules/ecommerce/services/country_codes'

const CITY_DIR = app.makePath('modules/ecommerce/data/cities')

/**
 * The country list exists twice — once on the server as the authority, once in
 * `inertia/lib/countries.ts` so a dropdown does not need a round trip. Two
 * copies of one list drift, and the failure is quiet: a country the picker
 * offers but the server rejects looks like a broken form to whoever picked it.
 *
 * Read as text rather than imported, because the client copy lives under the
 * module's `ui/` tree, which is a separate tsconfig with its own `~/` alias
 * that the server cannot resolve.
 */
function clientCountryCodes(): string[] {
  const source = readFileSync(app.makePath('modules/ecommerce/ui/lib/countries.ts'), 'utf8')

  /**
   * Slice from just past the opening bracket. Searching for `]` from the start
   * of the marker would find the one inside `string[]` instead — which is how
   * this parsed to nothing the first time.
   */
  const marker = 'COUNTRY_CODES: readonly string[] = ['
  const start = source.indexOf(marker)
  if (start === -1) return []

  const open = start + marker.length
  const body = source.slice(open, source.indexOf(']', open))

  return [...body.matchAll(/'([A-Z]{2})'/g)].map((m) => m[1])
}

test.group('Geo | country list', () => {
  test('the client copy matches the server authority exactly', ({ assert }) => {
    const client = clientCountryCodes()

    assert.isAbove(client.length, 200, 'the client list failed to parse')
    assert.sameMembers(client, [...COUNTRY_CODES])
  })

  test('holds no duplicates', ({ assert }) => {
    assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length)
  })

  test('every code is two uppercase letters', ({ assert }) => {
    assert.isEmpty(COUNTRY_CODES.filter((code) => !/^[A-Z]{2}$/.test(code)))
  })

  /**
   * ICU knows 31 region codes that are not ISO 3166-1 countries — aggregates,
   * deprecated states and two pseudo-locale test codes. Any of them appearing
   * here would mean someone enumerated `Intl.DisplayNames` instead of using the
   * standard, and the picker would start offering "European Union" and
   * "Pseudo-Accents" as places to post a parcel.
   */
  test('excludes ICU region codes that are not countries', ({ assert }) => {
    const notCountries = ['EU', 'EZ', 'UN', 'QO', 'UK', 'SU', 'YU', 'DD', 'AN', 'XA', 'XB']

    for (const code of notCountries) {
      assert.isFalse(isKnownCountry(code), `${code} is not an ISO 3166-1 country`)
    }
  })

  test('recognises a country whatever the casing', ({ assert }) => {
    assert.isTrue(isKnownCountry('ID'))
    assert.isTrue(isKnownCountry('id'))
    assert.isTrue(isKnownCountry(' id '))
    assert.equal(normaliseCountry('id'), 'ID')
  })

  /**
   * `null` rather than the input, so an unrecognised code cannot reach the
   * database by being quietly passed through.
   */
  test('refuses what it does not recognise', ({ assert }) => {
    for (const bad of ['ZZ', 'QQ', 'GBR', 'U', '', '  ', null, undefined]) {
      assert.isFalse(isKnownCountry(bad))
      assert.isNull(normaliseCountry(bad))
    }
  })
})

test.group('Geo | city data', () => {
  test('the index matches what is actually on disk', ({ assert }) => {
    const index: string[] = JSON.parse(readFileSync(join(CITY_DIR, 'index.json'), 'utf8'))
    const onDisk = readdirSync(CITY_DIR)
      .filter((name) => /^[A-Z]{2}\.json$/.test(name))
      .map((name) => name.slice(0, 2))

    /**
     * A drifted index is a silent failure in both directions: a country listed
     * with no file 404s on every keystroke, and a file no index mentions is
     * never asked for at all.
     */
    assert.sameMembers(index, onDisk)
  })

  test('every country with city data is a country we accept', ({ assert }) => {
    const index: string[] = JSON.parse(readFileSync(join(CITY_DIR, 'index.json'), 'utf8'))

    // Data for a country the picker cannot select is data nobody can reach.
    assert.isEmpty(index.filter((code) => !isKnownCountry(code)))
  })

  test('each file is a non-empty list of city names', ({ assert }) => {
    const index: string[] = JSON.parse(readFileSync(join(CITY_DIR, 'index.json'), 'utf8'))

    for (const code of index) {
      const cities = JSON.parse(readFileSync(join(CITY_DIR, `${code}.json`), 'utf8'))

      assert.isArray(cities, `${code}.json is not an array`)
      assert.isNotEmpty(cities, `${code}.json is empty`)
      assert.isTrue(
        cities.every((name: unknown) => typeof name === 'string' && name.length > 0),
        `${code}.json holds something that is not a city name`
      )
    }
  })

  /**
   * Population order is the whole reason the suggestion list is useful: someone
   * typing "ja" in Indonesia wants Jakarta first, not Jailolo. Alphabetical
   * order would be indistinguishable from a sorted list at a glance, so assert
   * the property that actually matters — the biggest city comes first.
   */
  test('names are ordered by size, largest first', ({ assert }) => {
    const expected: Record<string, string> = {
      ID: 'Jakarta',
      US: 'New York City',
      GB: 'London',
      IN: 'Mumbai',
      JP: 'Tokyo',
    }

    for (const [code, city] of Object.entries(expected)) {
      const cities: string[] = JSON.parse(readFileSync(join(CITY_DIR, `${code}.json`), 'utf8'))
      assert.equal(cities[0], city, `${code} should start with ${city}`)
    }
  })

  test('carries the attribution its licence requires', ({ assert }) => {
    const readme = readFileSync(join(CITY_DIR, 'README.txt'), 'utf8')

    // GeoNames is CC BY 4.0; redistributing it without credit is a breach.
    assert.include(readme, 'GeoNames')
    assert.include(readme, 'CC BY 4.0')
  })
})
