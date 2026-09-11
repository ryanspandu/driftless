import { useRef, useState } from 'react'
import { Download, FileUp, Loader2, Upload } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { apiErrorMessage } from '~/lib/api'
import { useImportProducts, type ProductImportResult } from '../_api'

/** Where the "Download template" link points — the products export is the exact
 *  column set the importer reads, so an export is a ready-made template. */
const TEMPLATE_URL = '/api/admin/ecommerce/exports/products'

export function ImportProductsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ProductImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importProducts = useImportProducts()

  // Reset the transient state whenever the dialog is opened or closed, so a
  // second import never opens onto the first one's report.
  function reset() {
    setFile(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function submit() {
    if (!file) return
    setError(null)
    try {
      const res = await importProducts.mutateAsync(file)
      setResult(res)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>
            Upload a CSV to create or update products in bulk. Rows are matched by slug (and
            variants by SKU), so re-importing an export updates rather than duplicates.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <ImportReport result={result} />
        ) : (
          <div className="space-y-4">
            <a
              href={TEMPLATE_URL}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Download className="size-4" aria-hidden />
              Download template
            </a>

            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center transition-colors hover:border-ring hover:bg-muted/60"
              htmlFor="product-import-file"
            >
              <FileUp className="size-6 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{file ? file.name : 'Choose a CSV file'}</span>
              <span className="text-xs text-muted-foreground">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'or drag it onto this box'}
              </span>
              <input
                ref={inputRef}
                id="product-import-file"
                type="file"
                accept=".csv,text/csv,.txt"
                className="sr-only"
                onChange={(e) => {
                  setError(null)
                  setFile(e.target.files?.[0] ?? null)
                }}
              />
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>
                Import another
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                className="gap-2"
                disabled={!file || importProducts.isPending}
                onClick={submit}
              >
                {importProducts.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportReport({ result }: { result: ProductImportResult }) {
  const { created, updated, skipped, errors } = result
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Created" value={created} tone="success" />
        <Stat label="Updated" value={updated} tone="default" />
        <Stat label="Skipped" value={skipped} tone={skipped > 0 ? 'warning' : 'muted'} />
      </div>

      {errors.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {errors.length} {errors.length === 1 ? 'row was' : 'rows were'} not imported
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground">
                <tr>
                  <th className="w-16 px-3 py-1.5 font-medium">Row</th>
                  <th className="px-3 py-1.5 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={`${e.row}-${i}`} className="border-t border-border">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{e.row}</td>
                    <td className="px-3 py-1.5">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Every row imported cleanly.</p>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'warning' | 'default' | 'muted'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
      <div className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
