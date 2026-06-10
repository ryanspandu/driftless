import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { AppSelect } from "~/components/ui/app-select";

/** 0-based page indices to render as buttons, with ellipsis between gaps */
export function getDataTablePageList(
  pageIndex: number,
  pageCount: number
): (number | "ellipsis")[] {
  if (pageCount <= 0) return [];
  if (pageCount <= 9) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }

  const set = new Set<number>([0, pageCount - 1]);
  const addRange = (a: number, b: number) => {
    for (let i = a; i <= b; i++) {
      if (i >= 0 && i < pageCount) set.add(i);
    }
  };
  addRange(pageIndex - 1, pageIndex + 1);
  if (pageIndex < 4) addRange(1, 4);
  if (pageIndex > pageCount - 5) addRange(pageCount - 5, pageCount - 2);

  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      out.push("ellipsis");
    }
    out.push(sorted[i]);
  }
  return out;
}

export type DataTablePaginationProps = {
  /** 0-based current page index */
  pageIndex: number;
  pageSize: number;
  /** Total rows across all pages */
  totalRows: number;
  pageCount: number;
  pageSizeOptions?: number[];
  onPageIndexChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
  className?: string;
};

export function DataTablePagination({
  pageIndex,
  pageSize,
  totalRows,
  pageCount,
  pageSizeOptions = [5, 10, 20, 50],
  onPageIndexChange,
  onPageSizeChange,
  disabled = false,
  className,
}: DataTablePaginationProps) {
  const rowsPerPageId = React.useId();
  const goToPageId = React.useId();
  const [goToPageInput, setGoToPageInput] = React.useState(
    String(pageIndex + 1)
  );

  const safePageCount = Math.max(pageCount, 1);
  const start = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalRows);
  const canPrevious = pageIndex > 0 && !disabled;
  const canNext = pageIndex < safePageCount - 1 && !disabled;
  const showPageControls = safePageCount > 1;

  React.useEffect(() => {
    setGoToPageInput(String(pageIndex + 1));
  }, [pageIndex]);

  const commitGoToPage = React.useCallback(() => {
    const parsed = Number.parseInt(goToPageInput, 10);
    if (Number.isNaN(parsed)) {
      setGoToPageInput(String(pageIndex + 1));
      return;
    }
    const safe = Math.max(1, Math.min(safePageCount, parsed));
    onPageIndexChange(safe - 1);
    setGoToPageInput(String(safe));
  }, [goToPageInput, onPageIndexChange, pageIndex, safePageCount]);

  const pageItems = React.useMemo(
    () => getDataTablePageList(pageIndex, safePageCount),
    [pageIndex, safePageCount]
  );

  return (
    <div
      className={
        className ??
        "flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-3"
      }
    >
      <div className="flex flex-wrap items-center gap-4 lg:min-w-0 lg:flex-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={rowsPerPageId} className="text-muted-foreground">
            Rows per page
          </Label>
          <AppSelect
            id={rowsPerPageId}
            value={String(pageSize)}
            onChange={(v) => onPageSizeChange(Number(v))}
            options={pageSizeOptions.map((n) => ({
              value: String(n),
              label: String(n),
            }))}
            size="sm"
            isSearchable={false}
            disabled={disabled}
            className="w-[4.5rem]"
          />
        </div>
        <p className="text-sm text-muted-foreground whitespace-nowrap">
          {start}–{end} of {totalRows}
          {showPageControls
            ? ` · Page ${pageIndex + 1} of ${safePageCount}`
            : null}
        </p>
      </div>

      {showPageControls ? (
        <>
          <div className="flex flex-wrap items-center justify-center gap-1 lg:flex-[1.5] lg:justify-center">
            <Button
              variant="outline"
              size="sm"
              className="size-8 p-0"
              onClick={() => onPageIndexChange(0)}
              disabled={!canPrevious}
              aria-label="First page"
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="size-8 p-0"
              onClick={() => onPageIndexChange(pageIndex - 1)}
              disabled={!canPrevious}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            {pageItems.map((item, i) =>
              item === "ellipsis" ? (
                <span
                  key={`e-${i}`}
                  className="flex size-8 items-center justify-center text-sm text-muted-foreground"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  variant={pageIndex === item ? "default" : "outline"}
                  size="sm"
                  className="size-8 min-w-8 p-0 tabular-nums"
                  onClick={() => onPageIndexChange(item)}
                  disabled={disabled}
                  aria-label={`Page ${item + 1}`}
                  aria-current={pageIndex === item ? "page" : undefined}
                >
                  {item + 1}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              className="size-8 p-0"
              onClick={() => onPageIndexChange(pageIndex + 1)}
              disabled={!canNext}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="size-8 p-0"
              onClick={() => onPageIndexChange(safePageCount - 1)}
              disabled={!canNext}
              aria-label="Last page"
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 lg:min-w-0 lg:flex-1 lg:justify-end">
            <Label htmlFor={goToPageId} className="text-muted-foreground">
              Go to page
            </Label>
            <Input
              id={goToPageId}
              type="text"
              inputMode="numeric"
              className="h-8 w-14 px-2 text-center tabular-nums"
              value={goToPageInput}
              onChange={(e) => setGoToPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitGoToPage();
              }}
              onBlur={commitGoToPage}
              disabled={disabled}
              aria-label="Go to page number"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
