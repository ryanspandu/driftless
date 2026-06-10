import type { ReadonlyURLSearchParams } from "~/hooks/use-inertia-url";
import type { SortingState } from "@tanstack/react-table";

/** Build query param name: `q` or `all_q` when prefix is `all`. */
export function tableParamKey(prefix: string | undefined, base: string): string {
  return prefix ? `${prefix}_${base}` : base;
}

export type TableUrlRead = {
  q: string;
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
};

export function readTableUrlParams(
  searchParams: ReadonlyURLSearchParams,
  options: {
    paramPrefix?: string;
    defaultPageSize: number;
    pageSizeOptions: number[];
    /** When false (e.g. table search is hidden), ignore `q` in the URL so page-level `q` can be used elsewhere. */
    includeQuery?: boolean;
  },
): TableUrlRead {
  const { paramPrefix, defaultPageSize, pageSizeOptions, includeQuery = true } =
    options;
  const p = (b: string) => tableParamKey(paramPrefix, b);

  const q = includeQuery === false ? "" : (searchParams.get(p("q")) ?? "");
  const pageRaw = parseInt(searchParams.get(p("page")) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const rawSize = parseInt(
    searchParams.get(p("size")) ?? String(defaultPageSize),
    10,
  );
  const pageSize = pageSizeOptions.includes(rawSize) ? rawSize : defaultPageSize;

  const sortCol = searchParams.get(p("sort"))?.trim() ?? "";
  const orderRaw = searchParams.get(p("order"));
  const desc = orderRaw !== "asc";
  const sorting: SortingState =
    sortCol.length > 0 ? [{ id: sortCol, desc }] : [];

  return {
    q,
    pageIndex: page - 1,
    pageSize,
    sorting,
  };
}

export function mergeSearchParams(
  current: ReadonlyURLSearchParams | URLSearchParams,
  updates: Record<string, string | undefined | null>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next.toString();
}

/**
 * Merge into the **live** browser query string when available so concurrent
 * `router.replace` calls cannot drop params from a stale `useSearchParams()` snapshot
 * (e.g. list filters + table pagination on the same route).
 */
export function mergeSearchParamsLive(
  fallback: ReadonlyURLSearchParams,
  updates: Record<string, string | undefined | null>,
): string {
  const base =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams(fallback.toString());
  return mergeSearchParams(base, updates);
}

export function pathWithSearch(pathname: string, search: string): string {
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

/**
 * Skip `router.replace` when the target URL already matches the browser.
 * Prevents Inertia visit loops that refetch React Query data on every tick.
 */
export function replaceUrlIfChanged(
  pathname: string,
  router: { replace: (href: string, options?: { scroll?: boolean }) => void },
  mergedSearch: string,
  options?: { scroll?: boolean },
): void {
  const next = pathWithSearch(pathname, mergedSearch);
  if (typeof window !== "undefined") {
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return;
  }
  router.replace(next, options);
}

/** Omit defaults so URLs stay short. */
export function buildTableUrlPatch(
  read: TableUrlRead,
  options: {
    paramPrefix?: string;
    defaultPageSize: number;
    /** When false, do not read/write table `q` (avoids clobbering a page-level search param). */
    includeQuery?: boolean;
  },
): Record<string, string | undefined> {
  const { paramPrefix, defaultPageSize, includeQuery = true } = options;
  const p = (b: string) => tableParamKey(paramPrefix, b);
  const patch: Record<string, string | undefined> = {};

  if (includeQuery !== false) {
    patch[p("q")] = read.q.trim() ? read.q : undefined;
  }

  const page = read.pageIndex + 1;
  patch[p("page")] = page > 1 ? String(page) : undefined;

  patch[p("size")] =
    read.pageSize !== defaultPageSize ? String(read.pageSize) : undefined;

  if (read.sorting.length > 0) {
    const s = read.sorting[0];
    if (s) {
      patch[p("sort")] = s.id;
      patch[p("order")] = s.desc ? "desc" : "asc";
    }
  } else {
    patch[p("sort")] = undefined;
    patch[p("order")] = undefined;
  }

  return patch;
}
