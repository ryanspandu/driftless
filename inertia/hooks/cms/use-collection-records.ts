import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiGet } from '~/lib/api'
import type { CmsRecord } from '~/puck/collection-list'

/**
 * Read published records of any CMS collection at runtime — the first-class way
 * for a **custom code kit** to list or fetch collection data on its own (the
 * builder's Collection List block can't be reused outside the builder).
 *
 * Hits the public read API `GET /api/public/cms/:key/records[/:id]` (served by
 * `public_cms_controller`): unauthenticated, **PUBLISHED-only**, and serving both
 * built-in collections (`posts`, `products`) and dynamic CMS collections. On this
 * public path relation fields resolve to display strings and media fields to
 * public URLs.
 *
 * These run on the client (react-query is provided app-wide). A kit page renders
 * on the server too, but this hook does not prefetch — so the first SSR/SSG paint
 * shows the loading/empty state and data arrives after hydration. For
 * SEO-critical, server-rendered lists use the builder's Collection List block
 * instead (it has the SSR preload).
 */

/** A collection's `CmsRecord` — re-exported so kit authors import it from here. */
export type { CmsRecord }

/** One page of records, as the list endpoint returns it. */
export interface CmsRecordsPage {
  items: CmsRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface UseCollectionRecordsOptions {
  /** Records per page, 1–100 (the server clamps). Default 12. Note: the wire param is `limit`. */
  limit?: number
  /** 1-based page number. Default 1. */
  page?: number
  /** A field key, or `created_at` / `updated_at`. Default: newest first server-side. */
  sortField?: string
  sortDir?: 'asc' | 'desc'
  /** Filter one field by substring — `filterField` AND `filterValue` must both be set. */
  filterField?: string
  filterValue?: string
  /** Free-text search across the collection's text fields. */
  search?: string
  /** Skip the query while false. Default true (the query is also idle when `key` is empty). */
  enabled?: boolean
  /** ms before a cached page is considered stale. Default 30_000. */
  staleTime?: number
}

/** The querystring the public list endpoint accepts (mirrors `collection-list.tsx`). */
function recordsQuery(options: UseCollectionRecordsOptions): string {
  const p = new URLSearchParams({
    limit: String(options.limit ?? 12),
    page: String(options.page ?? 1),
  })
  if (options.sortField) p.set('sortField', options.sortField)
  if (options.sortDir) p.set('sortDir', options.sortDir)
  if (options.filterField && options.filterValue) {
    p.set('filterField', options.filterField)
    p.set('filterValue', options.filterValue)
  }
  if (options.search) p.set('search', options.search)
  return p.toString()
}

/** One page of a collection's published records. */
export function useCollectionRecords(
  key: string,
  options: UseCollectionRecordsOptions = {}
): UseQueryResult<CmsRecordsPage> {
  const qs = recordsQuery(options)
  return useQuery<CmsRecordsPage>({
    queryKey: ['public-cms-records', key, qs] as const,
    enabled: !!key && (options.enabled ?? true),
    queryFn: () =>
      apiGet<CmsRecordsPage>(`/api/public/cms/${encodeURIComponent(key)}/records?${qs}`),
    staleTime: options.staleTime ?? 30_000,
  })
}

/** One published record by id. 404s (react-query error) when it is not published. */
export function useCollectionRecord(key: string, id: string): UseQueryResult<CmsRecord> {
  return useQuery<CmsRecord>({
    queryKey: ['public-cms-record', key, id] as const,
    enabled: !!key && !!id,
    queryFn: () =>
      apiGet<CmsRecord>(
        `/api/public/cms/${encodeURIComponent(key)}/records/${encodeURIComponent(id)}`
      ),
  })
}
