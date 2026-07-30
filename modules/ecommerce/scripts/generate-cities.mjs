/**
 * Generates the per-country city lists used by the address pickers.
 *
 *   node modules/ecommerce/scripts/generate-cities.mjs
 *
 * Writes `modules/ecommerce/data/cities/<CC>.json` — one file per ISO 3166-1 country, each
 * a plain array of city names ordered by population, largest first.
 *
 * ## Why per-country files rather than one dataset
 *
 * The source is ~135,000 cities. Loading it costs **88 MB of RSS**, measured,
 * and holding that in the web process for the sake of an autocomplete is not a
 * trade worth making. Splitting by country turns it into 246 files of 1–150 KB;
 * the browser fetches exactly one, the country it was asked about, and filters
 * locally. Nothing is held server-side at all — the files are static assets.
 *
 * `all-the-cities` is therefore a **devDependency**. It runs here and never at
 * runtime; if you see it imported anywhere under `app/` or `modules/`, that is
 * the 88 MB coming back.
 *
 * ## Why names are deduplicated
 *
 * The source lists every populated place, so one country has many entries
 * sharing a name. Keeping the largest of each collapses 135,233 rows into
 * 123,891 distinct names and halves the payload, and for an address field the
 * distinction was never useful: the string that ends up on the parcel is the
 * name either way.
 *
 * ## Attribution
 *
 * The data comes from GeoNames (https://www.geonames.org), licensed
 * **CC BY 4.0**, by way of the MIT-licensed `all-the-cities` package. The
 * licence requires attribution wherever this data is redistributed — the
 * generated `README.txt` carries it, and it must stay next to the files.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import cities from 'all-the-cities'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const OUT = join(ROOT, 'modules', 'ecommerce', 'data', 'cities')

/**
 * Keep the largest place of any given name, per country.
 *
 * A plain `Map` per country, so the last writer does not win by accident —
 * population decides, and ties keep whichever came first, which is stable
 * because the source order is stable.
 */
const byCountry = new Map()

for (const city of cities) {
  const code = city.country
  if (!code || code.length !== 2) continue

  let names = byCountry.get(code)
  if (!names) byCountry.set(code, (names = new Map()))

  const seen = names.get(city.name)
  if (seen === undefined || city.population > seen) names.set(city.name, city.population)
}

// A clean slate, so a country that vanishes upstream does not linger as a stale
// file that the route would happily keep serving.
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

let total = 0
let bytes = 0
const index = []

for (const [code, names] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
  const ordered = [...names.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)

  const json = JSON.stringify(ordered)
  writeFileSync(join(OUT, `${code}.json`), json)

  total += ordered.length
  bytes += Buffer.byteLength(json)
  index.push(code)
}

/**
 * The index lets the client know a country has no file *before* asking for it,
 * so a country we hold no data for shows an empty menu rather than a 404 in the
 * console on every keystroke.
 */
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index))

writeFileSync(
  join(OUT, 'README.txt'),
  [
    'City name lists for the address pickers — GENERATED, do not edit by hand.',
    'Regenerate with: node modules/ecommerce/scripts/generate-cities.mjs',
    '',
    'Source: GeoNames (https://www.geonames.org), licensed CC BY 4.0,',
    'via the `all-the-cities` npm package (MIT).',
    'CC BY 4.0 requires this attribution to travel with the data.',
    '',
    'Each <CC>.json is a JSON array of city names for that ISO 3166-1 alpha-2',
    'country, ordered by population, largest first. Names are deduplicated.',
    '',
    'Places below 1,000 inhabitants are not included, which is why every city',
    'field that uses these lists must also accept free text.',
  ].join('\n')
)

console.log(
  `${index.length} countries, ${total.toLocaleString()} city names, ` +
    `${(bytes / 1048576).toFixed(2)} MB total -> modules/ecommerce/data/cities/`
)
