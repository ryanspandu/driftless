import { useEffect, useState } from 'react'

/**
 * City suggestions for an address field, fetched one country at a time.
 *
 * The full dataset is ~124,000 names across 246 countries. Bundling it would
 * add megabytes to a checkout page, and holding it server-side costs 88 MB of
 * RSS (measured) — so it is neither. `scripts/generate-cities.mjs` splits it
 * into per-country files the module carries and serves itself, and the browser
 * fetches exactly the one it needs: 21 KB for Indonesia, 150 KB for the United
 * States, once per session, cached immutably.
 *
 * Once fetched, filtering is local, so typing has no latency and no debounce to
 * tune. That is the reason for the per-country split rather than a search
 * endpoint — the network is touched once, not once per keystroke.
 *
 * **The list is a convenience, never a constraint.** The source stops at
 * places of 1,000 inhabitants, so villages, hamlets and new developments are
 * simply not in it. Every field built on this must accept free text, or a buyer
 * in a small village cannot enter their own address.
 */

/** Country → its city names, keyed so a second component reuses the first fetch. */
const cache = new Map<string, Promise<string[]>>()

/** Which countries have a file at all, so we never ask for one that 404s. */
let indexPromise: Promise<Set<string>> | null = null

function loadIndex(): Promise<Set<string>> {
  if (!indexPromise) {
    indexPromise = fetch('/api/shop/geo/cities')
      .then((res) => (res.ok ? res.json() : []))
      .then((codes: unknown) => new Set(Array.isArray(codes) ? (codes as string[]) : []))
      /**
       * A failed index must not poison the session. Clearing it means the next
       * mount retries; leaving the rejected promise cached would disable
       * suggestions until reload, for what is usually a transient blip.
       */
      .catch(() => {
        indexPromise = null
        return new Set<string>()
      })
  }
  return indexPromise
}

export function loadCities(country: string): Promise<string[]> {
  const code = country.trim().toUpperCase()
  if (code.length !== 2) return Promise.resolve([])

  const hit = cache.get(code)
  if (hit) return hit

  const request = loadIndex()
    .then((index) => {
      // Uninhabited territories have no file, and that is correct rather than
      // an error — Bouvet Island has no cities.
      if (!index.has(code)) return []
      return fetch(`/api/shop/geo/cities/${code}`).then((res) => (res.ok ? res.json() : []))
    })
    .then((names: unknown) => (Array.isArray(names) ? (names as string[]) : []))
    .catch(() => {
      cache.delete(code)
      return []
    })

  cache.set(code, request)
  return request
}

/**
 * The city names for `country`, or an empty list while loading or unknown.
 *
 * Never throws and never surfaces a loading state to the caller: the field it
 * feeds is a free-text input that works perfectly well with no suggestions, so
 * a spinner would be noise and an error message would be alarming about
 * nothing.
 */
export function useCities(country: string | null | undefined): string[] {
  const code = (country ?? '').trim().toUpperCase()
  const [cities, setCities] = useState<string[]>([])

  useEffect(() => {
    if (code.length !== 2) {
      setCities([])
      return
    }

    /**
     * Guards against a slow fetch for a country the user has already moved on
     * from — without it, picking Indonesia then the US could leave Indonesian
     * cities in the menu when the first request finally lands.
     */
    let live = true
    loadCities(code).then((names) => {
      if (live) setCities(names)
    })
    return () => {
      live = false
    }
  }, [code])

  return cities
}
