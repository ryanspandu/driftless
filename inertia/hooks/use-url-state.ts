import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from '~/hooks/use-inertia-url'
import { mergeSearchParamsLive, replaceUrlIfChanged } from '~/lib/table-url-params'

/**
 * Page state that lives in the URL rather than in `useState`.
 *
 * Tabs, filters, search and paging are all the same thing from the outside: a
 * view of a page that someone should be able to link to, reload without losing,
 * and reach with the browser's back button. State kept only in React does none
 * of those — the tab is a local variable, and the URL is a lie about what is on
 * screen.
 *
 * The shared implementation exists because writing this dance per page is how
 * seven pages end up with seven slightly different behaviours: one that forgets
 * to reset paging, one that leaves `?status=all` in the URL, one that pushes
 * instead of replacing and fills the back button with noise.
 */
export interface UrlState {
  /** A raw parameter, or `fallback` when it is absent. */
  get(key: string, fallback?: string): string

  /**
   * A parameter constrained to a known set.
   *
   * Anything unrecognised falls back rather than erroring — a hand-edited or
   * stale link should show the default view, not a broken page.
   */
  one<T extends string>(key: string, allowed: readonly T[], fallback: T): T

  /** A positive integer parameter, e.g. a page number. */
  int(key: string, fallback: number): number

  /**
   * Write parameters, dropping any whose value matches its default.
   *
   * `undefined`, `null` and `''` all delete the key, so a page in its default
   * state has a clean URL instead of `?tab=all&status=all&page=1`.
   *
   * Uses `replace`, not `push`: flipping a filter three times should not put
   * three entries in the back button.
   */
  set(patch: Record<string, string | number | undefined | null>): void
}

export function useUrlState(): UrlState {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const get = useCallback(
    (key: string, fallback = '') => searchParams.get(key) ?? fallback,
    [searchParams]
  )

  const one = useCallback(
    <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
      const value = searchParams.get(key)
      return value !== null && (allowed as readonly string[]).includes(value)
        ? (value as T)
        : fallback
    },
    [searchParams]
  )

  const int = useCallback(
    (key: string, fallback: number) => {
      const parsed = Number(searchParams.get(key))
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
    },
    [searchParams]
  )

  const set = useCallback(
    (patch: Record<string, string | number | undefined | null>) => {
      const normalised: Record<string, string | undefined> = {}
      for (const [key, value] of Object.entries(patch)) {
        normalised[key] =
          value === undefined || value === null || value === '' ? undefined : String(value)
      }

      const merged = mergeSearchParamsLive(searchParams, normalised)
      replaceUrlIfChanged(pathname, router, merged, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  return { get, one, int, set }
}
