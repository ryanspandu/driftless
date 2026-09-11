
import * as React from "react";
import {
  usePathname,
  useRouter,
  type ReadonlyURLSearchParams,
} from "~/hooks/use-inertia-url";
import type { SortingState, Updater } from "@tanstack/react-table";
import {
  buildTableUrlPatch,
  mergeSearchParamsLive,
  readTableUrlParams,
  replaceUrlIfChanged,
  type TableUrlRead,
} from "~/lib/table-url-params";

function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
}

export type DataTableUrlSyncState = {
  globalFilter: string;
  setGlobalFilter: (v: string) => void;
  pagination: { pageIndex: number; pageSize: number };
  setPagination: (updater: Updater<{ pageIndex: number; pageSize: number }>) => void;
  sorting: SortingState;
  setSorting: (updater: Updater<SortingState>) => void;
};

export function useDataTableUrlSync(options: {
  paramPrefix?: string;
  defaultPageSize: number;
  pageSizeOptions: number[];
  searchParams: ReadonlyURLSearchParams;
  /** When false, table search is not stored in the URL (use when the route uses `q` for something else). */
  includeQueryInUrl?: boolean;
}): DataTableUrlSyncState {
  const {
    paramPrefix,
    defaultPageSize,
    pageSizeOptions,
    searchParams,
    includeQueryInUrl = true,
  } = options;
  const router = useRouter();
  const pathname = usePathname();

  const snapshot = React.useMemo(
    () =>
      readTableUrlParams(searchParams, {
        paramPrefix,
        defaultPageSize,
        pageSizeOptions,
        includeQuery: includeQueryInUrl,
      }),
    [
      searchParams,
      paramPrefix,
      defaultPageSize,
      pageSizeOptions,
      includeQueryInUrl,
    ],
  );

  const [globalFilter, setGlobalFilterState] = React.useState(snapshot.q);
  const [pagination, setPaginationState] = React.useState({
    pageIndex: snapshot.pageIndex,
    pageSize: snapshot.pageSize,
  });
  const [sorting, setSortingState] =
    React.useState<SortingState>(snapshot.sorting);

  const snapshotKey = React.useMemo(
    () =>
      `${snapshot.q}|${snapshot.pageIndex}|${snapshot.pageSize}|${JSON.stringify(snapshot.sorting)}`,
    [snapshot],
  );
  const prevSnapshotKey = React.useRef(snapshotKey);

  React.useLayoutEffect(() => {
    if (prevSnapshotKey.current === snapshotKey) return;
    prevSnapshotKey.current = snapshotKey;
    setGlobalFilterState(snapshot.q);
    setPaginationState({
      pageIndex: snapshot.pageIndex,
      pageSize: snapshot.pageSize,
    });
    setSortingState(snapshot.sorting);
  }, [snapshot, snapshotKey]);

  const writeToUrl = React.useCallback(
    (read: TableUrlRead) => {
      const patch = buildTableUrlPatch(read, {
        paramPrefix,
        defaultPageSize,
        includeQuery: includeQueryInUrl,
      })
      const merged = mergeSearchParamsLive(searchParams, patch)
      replaceUrlIfChanged(pathname, router, merged, { scroll: false })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mergeSearchParamsLive reads window.location on the client; `searchParams` is SSR fallback only
    [router, pathname, paramPrefix, defaultPageSize, includeQueryInUrl],
  );

  const stateRef = React.useRef({
    globalFilter,
    pagination,
    sorting,
  });
  React.useLayoutEffect(() => {
    stateRef.current = { globalFilter, pagination, sorting };
  });

  const skipInitialFilterUrl = React.useRef(true);
  const skipInitialPageUrl = React.useRef(true);

  React.useEffect(() => {
    if (skipInitialFilterUrl.current) {
      skipInitialFilterUrl.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      const r = stateRef.current;
      writeToUrl({
        q: r.globalFilter,
        pageIndex: r.pagination.pageIndex,
        pageSize: r.pagination.pageSize,
        sorting: r.sorting,
      });
    }, 300);
    return () => window.clearTimeout(id);
  }, [globalFilter, writeToUrl]);

  React.useEffect(() => {
    if (skipInitialPageUrl.current) {
      skipInitialPageUrl.current = false;
      return;
    }
    const r = stateRef.current;
    writeToUrl({
      q: r.globalFilter,
      pageIndex: r.pagination.pageIndex,
      pageSize: r.pagination.pageSize,
      sorting: r.sorting,
    });
  }, [pagination, sorting, writeToUrl]);

  const setGlobalFilter = React.useCallback((v: string) => {
    setGlobalFilterState(v);
    setPaginationState((p) => ({ ...p, pageIndex: 0 }));
  }, []);

  const setPagination = React.useCallback(
    (updater: Updater<{ pageIndex: number; pageSize: number }>) => {
      setPaginationState((prev) => applyUpdater(updater, prev));
    },
    [],
  );

  const setSorting = React.useCallback((updater: Updater<SortingState>) => {
    setSortingState((prev) => applyUpdater(updater, prev));
  }, []);

  return {
    globalFilter,
    setGlobalFilter,
    pagination,
    setPagination,
    sorting,
    setSorting,
  };
}
