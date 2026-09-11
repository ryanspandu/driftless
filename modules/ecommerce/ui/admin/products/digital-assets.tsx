import { useRef, useState } from 'react'
import { FileDown, Trash2, Upload } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { apiErrorMessage } from '~/lib/api-client'
import {
  useDeleteAsset,
  useProductAssets,
  useUpdateAsset,
  useUploadAsset,
  type DigitalAssetDto,
  type VariantDto,
} from '../_api'

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

/**
 * Files attached to a digital product.
 *
 * Shown only for `type: 'digital'` products. The panel deals in *assets* — what
 * is for sale — not in *grants*, which are what a specific buyer was given and
 * live on the order.
 */
export default function DigitalAssets({
  productId,
  variants,
}: {
  productId: string
  variants: VariantDto[]
}) {
  const assets = useProductAssets(productId)
  const upload = useUploadAsset(productId)
  const update = useUpdateAsset(productId)
  const remove = useDeleteAsset(productId)
  const confirmDelete = useConfirmDelete()

  const fileInput = useRef<HTMLInputElement>(null)
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '')
  const [maxDownloads, setMaxDownloads] = useState('0')
  const [linkTtlHours, setLinkTtlHours] = useState('72')
  const [error, setError] = useState<string | null>(null)

  const variantOptions = variants.map((variant) => ({
    value: variant.id,
    label: variant.title,
  }))

  const byVariant = (id: string) => (assets.data ?? []).filter((asset) => asset.variantId === id)

  async function onPick(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      await upload.mutateAsync({
        variantId,
        file,
        maxDownloads: Number(maxDownloads) || 0,
        linkTtlHours: Number(linkTtlHours) || 0,
      })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function limitsLabel(asset: DigitalAssetDto): string {
    const downloads = asset.maxDownloads > 0 ? `${asset.maxDownloads} downloads` : 'Unlimited'
    const expiry = asset.linkTtlHours > 0 ? `expires after ${asset.linkTtlHours}h` : 'never expires'
    return `${downloads} · ${expiry}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Files</CardTitle>
        <CardDescription>
          What the buyer downloads. Stored outside the public folder — the only way to reach a file
          is a paid order, so there is no URL to guess or share.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Save a variant first, then attach files.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-variant">Attach to</Label>
                <AppSelect
                  id="asset-variant"
                  value={variantId}
                  onChange={setVariantId}
                  options={variantOptions}
                  isSearchable={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-max">Download limit</Label>
                <Input
                  id="asset-max"
                  type="number"
                  min={0}
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">0 = unlimited</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-ttl">Link lifetime (hours)</Label>
                <Input
                  id="asset-ttl"
                  type="number"
                  min={0}
                  value={linkTtlHours}
                  onChange={(e) => setLinkTtlHours(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">0 = never expires</p>
              </div>
            </div>

            <div>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!variantId || upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-4" aria-hidden />
                {upload.isPending ? 'Uploading…' : 'Upload a file'}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Up to 500 MB. HTML, SVG and script files are refused — they execute in a browser;
                put them in a zip.
              </p>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="space-y-4">
              {variants.map((variant) => {
                const files = byVariant(variant.id)
                return (
                  <div key={variant.id} className="space-y-2">
                    <p className="text-sm font-medium">{variant.title}</p>
                    {files.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No files yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {files.map((asset) => (
                          <li
                            key={asset.id}
                            className="flex items-center gap-3 rounded-lg border border-border p-3"
                          >
                            <FileDown
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{asset.filename}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatBytes(asset.sizeBytes)} · {limitsLabel(asset)}
                              </p>
                            </div>
                            <Input
                              className="w-24"
                              type="number"
                              min={0}
                              defaultValue={asset.maxDownloads}
                              aria-label={`Download limit for ${asset.filename}`}
                              onBlur={(e) => {
                                const value = Number(e.target.value) || 0
                                if (value !== asset.maxDownloads) {
                                  update.mutate({ id: asset.id, input: { maxDownloads: value } })
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 shrink-0 text-destructive hover:text-destructive"
                              onClick={async () => {
                                const confirmed = await confirmDelete({
                                  title: `Remove ${asset.filename}?`,
                                  description:
                                    'New orders stop including it. Anyone who already bought it keeps their download.',
                                })
                                if (confirmed) remove.mutate(asset.id)
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden />
                              <span className="sr-only">Remove {asset.filename}</span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
