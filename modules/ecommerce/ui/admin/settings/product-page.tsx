import { useEffect, useState } from 'react'
import { Link } from '@inertiajs/react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { usePagesList } from '~/hooks/api/use-pages'
import { apiErrorMessage } from '~/lib/api-client'
import { useSeedStorefront, useStoreSettings, useUpdateStoreSettings } from '../_api'

/**
 * Which builder page renders every product.
 *
 * One designed page serves the whole catalogue: the operator drops a
 * `ProductDetail` block on it, leaves the slug blank, and `/shop/p/:slug` binds
 * the URL's product per request. Without this a catalogue needs one builder
 * page per product.
 */
export default function ProductPagePanel() {
  const settings = useStoreSettings()
  const pages = usePagesList()
  const update = useUpdateStoreSettings()
  const seed = useSeedStorefront()

  const [pageId, setPageId] = useState('')
  const [shopId, setShopId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settings.data) return
    setPageId(settings.data.productPageId ?? '')
    setShopId(settings.data.shopPageId ?? '')
  }, [settings.data])

  /** Only published pages: an unpublished template 404s every product page. */
  const options = [
    { value: '', label: 'No product pages' },
    ...(pages.data ?? [])
      .filter((page) => page.status === 'PUBLISHED')
      .map((page) => ({ value: page.id, label: `${page.title} · /${page.path}` })),
  ]

  async function onSave() {
    setError(null)
    setSaved(false)
    try {
      await update.mutateAsync({ productPageId: pageId || null, shopPageId: shopId || null })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storefront pages</CardTitle>
        <CardDescription>
          Both are ordinary builder pages, so you can redesign them like anything else. They
          were created for you when the module was switched on.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="shop-page">Shop front</Label>
          <AppSelect
            id="shop-page"
            value={shopId}
            onChange={setShopId}
            options={[
              { value: '', label: 'No shop front' },
              ...(pages.data ?? [])
                .filter((page) => page.status === 'PUBLISHED')
                .map((page) => ({ value: page.id, label: `${page.title} · /${page.path}` })),
            ]}
            placeholder={pages.isLoading ? 'Loading…' : 'Choose a page…'}
          />
          <p className="text-xs text-muted-foreground">
            Served at <code>/shop</code>. Put a <strong>Product List</strong> block on it to show
            the catalogue.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-page">Template page</Label>
          <AppSelect
            id="product-page"
            value={pageId}
            onChange={setPageId}
            options={options}
            placeholder={pages.isLoading ? 'Loading…' : 'Choose a page…'}
          />
          <p className="text-xs text-muted-foreground">
            Products are served at <code>/shop/p/&lt;slug&gt;</code>. Put a{' '}
            <strong>Product Detail</strong> block on it and leave the slug blank — the URL fills
            it in. Only published pages can be chosen; an unpublished one would 404 every
            product.
          </p>
        </div>

        {pageId ? (
          <p className="text-xs text-muted-foreground">
            <Link href={`/admin/pages/${pageId}/builder`} className="underline">
              Open it in the builder
            </Link>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No template chosen, so product URLs return 404. Products still appear in listing
            blocks.
          </p>
        )}

        {/*
          The way back for a store that was already running when this feature
          shipped: `onEnable` fires on the off→on edge, so those installs never
          got their pages and `/shop` simply 404s. Shown only when something is
          actually missing, so it does not sit there inviting a pointless click.
        */}
        {!pageId || !shopId ? (
          <div className="rounded-lg border border-dashed border-border p-4">
            <p className="text-sm font-medium">
              {!pageId && !shopId ? 'No storefront pages yet' : 'One page is missing'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create the defaults and point these at them. Nothing that already exists is
              touched.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={seed.isPending}
              onClick={async () => {
                setError(null)
                try {
                  await seed.mutateAsync()
                } catch (err) {
                  setError(apiErrorMessage(err))
                }
              }}
            >
              {seed.isPending ? 'Creating…' : 'Create default pages'}
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center gap-3">
          <Button type="button" disabled={update.isPending} onClick={onSave}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
