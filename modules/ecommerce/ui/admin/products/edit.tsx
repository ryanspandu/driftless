import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { router, usePage } from '@inertiajs/react'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import DigitalAssets from './digital-assets'
import VariantPrices from './variant-prices'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { AppSelect } from '~/components/ui/app-select'
import { MoneyInput } from '../../components/money-input'
import { BackButton } from '~/components/admin/back-button'
import { PageHeader } from '~/components/admin/page-header'
import { MediaImagePicker } from '~/components/admin/media-image-picker'
import { RichTextEditor } from '~/components/cms/rich-text-editor'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { apiErrorMessage } from '~/lib/api-client'
import {
  useCategories,
  useDeleteVariant,
  useProduct,
  useSaveProduct,
  useSaveVariant,
  useStoreSettings,
  type ProductStatus,
  type ProductType,
  type VariantDto,
} from '../_api'

interface PageProps {
  productId: string | null
}

/** Draft state for a variant row while it is being edited. */
interface VariantDraft {
  id: string | null
  title: string
  sku: string
  priceAmount: number | null
  compareAtAmount: number | null
  costAmount: number | null
  stockOnHand: number
  trackInventory: boolean
  allowBackorder: boolean
}

function variantToDraft(v: VariantDto): VariantDraft {
  return {
    id: v.id,
    title: v.title,
    sku: v.sku ?? '',
    priceAmount: v.price.amount,
    compareAtAmount: v.compareAt?.amount ?? null,
    costAmount: v.cost?.amount ?? null,
    stockOnHand: v.stockOnHand,
    trackInventory: v.trackInventory,
    allowBackorder: v.allowBackorder,
  }
}

function emptyDraft(): VariantDraft {
  return {
    id: null,
    title: 'Default',
    sku: '',
    priceAmount: 0,
    compareAtAmount: null,
    costAmount: null,
    stockOnHand: 0,
    trackInventory: true,
    allowBackorder: false,
  }
}

export default function ProductEditPage() {
  const { productId } = usePage<{ props: PageProps }>().props as unknown as PageProps
  const isNew = !productId

  const product = useProduct(productId)
  const categories = useCategories()
  const settings = useStoreSettings()
  const saveProduct = useSaveProduct()
  const saveVariant = useSaveVariant()
  const deleteVariant = useDeleteVariant()
  const confirmDelete = useConfirmDelete()

  const currency = settings.data?.currency ?? 'USD'

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState<unknown>('')
  const [type, setType] = useState<ProductType>('physical')
  const [status, setStatus] = useState<ProductStatus>('draft')
  const [featured, setFeatured] = useState(false)
  const [ctaMode, setCtaMode] = useState<'add_to_cart' | 'buy_now' | 'external'>('add_to_cart')
  const [externalUrl, setExternalUrl] = useState('')
  const [externalLabel, setExternalLabel] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [images, setImages] = useState<{ mediaUrl: string; alt?: string | null }[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  /**
   * The first variant of a brand-new product is edited inline and created in a
   * second request once the product exists — the API needs a product id before
   * it can attach a variant. For an existing product, variants are saved
   * individually as they are edited.
   */
  const [newVariant, setNewVariant] = useState<VariantDraft>(emptyDraft())
  const [drafts, setDrafts] = useState<Record<string, VariantDraft>>({})

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const data = product.data

  useEffect(() => {
    if (!data) return
    setTitle(data.title)
    setSlug(data.slug)
    setSubtitle(data.subtitle ?? '')
    setDescription(data.description ?? '')
    setType(data.type)
    setStatus(data.status)
    setFeatured(data.featured)
    setCtaMode(data.ctaMode ?? 'add_to_cart')
    setExternalUrl(data.externalUrl ?? '')
    setExternalLabel(data.externalLabel ?? '')
    setCategoryIds(data.categoryIds)
    setImages(data.images.map((img) => ({ mediaUrl: img.mediaUrl, alt: img.alt })))
    setDrafts(Object.fromEntries(data.variants.map((v) => [v.id, variantToDraft(v)])))
  }, [data])

  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categories.data]
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!title.trim()) {
      setError('A product needs a title.')
      return
    }

    try {
      const result = await saveProduct.mutateAsync({
        id: productId,
        input: {
          title: title.trim(),
          slug: slug.trim() || undefined,
          subtitle: subtitle.trim() || null,
          description: (typeof description === 'object' && description !== null
            ? description
            : {}) as Record<string, unknown>,
          type,
          status,
          featured,
          ctaMode,
          externalUrl: externalUrl.trim() || null,
          externalLabel: externalLabel.trim() || null,
          categoryIds,
          images,
        },
      })

      // A new product has no variants yet; create the one from the inline form
      // so it is immediately sellable rather than saved in an unbuyable state.
      if (isNew) {
        await saveVariant.mutateAsync({
          productId: result.id,
          variantId: null,
          input: {
            title: newVariant.title.trim() || 'Default',
            sku: newVariant.sku.trim() || null,
            priceAmount: newVariant.priceAmount ?? 0,
            compareAtAmount: newVariant.compareAtAmount,
            costAmount: newVariant.costAmount,
            stockOnHand: newVariant.stockOnHand,
            trackInventory: newVariant.trackInventory,
            allowBackorder: newVariant.allowBackorder,
          },
        })
        router.visit(`/admin/ecommerce/products/${result.id}`)
        return
      }

      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save the product'))
    }
  }

  async function onSaveVariant(draft: VariantDraft) {
    if (!productId) return
    setError(null)
    try {
      await saveVariant.mutateAsync({
        productId,
        variantId: draft.id,
        input: {
          title: draft.title.trim() || 'Default',
          sku: draft.sku.trim() || null,
          priceAmount: draft.priceAmount ?? 0,
          compareAtAmount: draft.compareAtAmount,
          costAmount: draft.costAmount,
          stockOnHand: draft.stockOnHand,
          trackInventory: draft.trackInventory,
          allowBackorder: draft.allowBackorder,
        },
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save the variant'))
    }
  }

  function updateDraft(id: string, patch: Partial<VariantDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/ecommerce/products" label="Back to products" />
        <PageHeader
          title={isNew ? 'New product' : (data?.title ?? 'Product')}
          subtitle={isNew ? 'Create a product and its first variant.' : `/${data?.slug ?? ''}`}
          className="flex-1"
        />
      </div>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-title">Title</Label>
                <Input
                  id="product-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Merino wool jumper"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-slug">URL slug</Label>
                <Input
                  id="product-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="Generated from the title if left blank"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-subtitle">Subtitle</Label>
                <Input
                  id="product-subtitle"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <RichTextEditor value={description} onChange={setDescription} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
              <CardDescription>The first image is used as the product thumbnail.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                {images.map((img, index) => (
                  <div
                    key={`${img.mediaUrl}-${index}`}
                    className="group relative size-24 overflow-hidden rounded-lg border border-border"
                  >
                    <img
                      src={img.mediaUrl}
                      alt={img.alt ?? ''}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="size-3" aria-hidden />
                      <span className="sr-only">Remove image</span>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  <ImagePlus className="size-5" aria-hidden />
                  <span className="text-xs">Add</span>
                </button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isNew ? 'First variant' : 'Variants'}</CardTitle>
              <CardDescription>
                {isNew
                  ? 'Every product needs at least one variant — this is what a customer actually buys.'
                  : 'Each variant carries its own price, SKU and stock.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isNew ? (
                <VariantFields
                  draft={newVariant}
                  currency={currency}
                  onChange={(patch) => setNewVariant((prev) => ({ ...prev, ...patch }))}
                />
              ) : (
                <div className="space-y-4">
                  {(data?.variants ?? []).map((variant) => {
                    const draft = drafts[variant.id]
                    if (!draft) return null
                    return (
                      <div
                        key={variant.id}
                        className="space-y-3 rounded-lg border border-border p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{variant.title}</span>
                            {variant.available !== null && variant.available <= 5 ? (
                              <Badge variant="warning">Low stock</Badge>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={saveVariant.isPending}
                              onClick={() => onSaveVariant(draft)}
                            >
                              Save variant
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={async () => {
                                const confirmed = await confirmDelete({
                                  title: `Delete variant "${variant.title}"?`,
                                  description:
                                    'Existing orders keep their own record of what was sold.',
                                })
                                if (confirmed && productId) {
                                  deleteVariant.mutate({ productId, variantId: variant.id })
                                }
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden />
                              <span className="sr-only">Delete variant</span>
                            </Button>
                          </div>
                        </div>
                        <VariantFields
                          draft={draft}
                          currency={currency}
                          onChange={(patch) => updateDraft(variant.id, patch)}
                        />
                        {/*
                          Only renders when the shop sells in more than one
                          currency, so a single-currency editor is unchanged.
                        */}
                        <VariantPrices variantId={variant.id} />
                      </div>
                    )
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => onSaveVariant({ ...emptyDraft(), title: 'New variant' })}
                    disabled={saveVariant.isPending}
                  >
                    <Plus className="size-4" aria-hidden />
                    Add variant
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/*
            Files only exist for digital products, and only once there is a
            variant to hang them on — an asset belongs to a variant, not to the
            product, so "which one does the buyer get" always has an answer.
          */}
          {!isNew && productId && type === 'digital' ? (
            <DigitalAssets productId={productId} variants={data?.variants ?? []} />
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Publishing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-status">Status</Label>
                <AppSelect
                  id="product-status"
                  value={status}
                  onChange={(v) => setStatus(v as ProductStatus)}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'active', label: 'Active' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Only active products appear on the storefront.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-type">Type</Label>
                <AppSelect
                  id="product-type"
                  value={type}
                  onChange={(v) => setType(v as ProductType)}
                  options={[
                    { value: 'physical', label: 'Physical' },
                    { value: 'digital', label: 'Digital' },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Digital products skip shipping and deliver a download link.
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Featured</p>
                  <p className="text-xs text-muted-foreground">Highlight on the storefront.</p>
                </div>
                <Switch checked={featured} onCheckedChange={setFeatured} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-cta">Buy button</Label>
                <AppSelect
                  id="product-cta"
                  value={ctaMode}
                  onChange={(value) => setCtaMode(value as typeof ctaMode)}
                  isSearchable={false}
                  options={[
                    { value: 'add_to_cart', label: 'Add to basket' },
                    { value: 'buy_now', label: 'Buy now — straight to checkout' },
                    { value: 'external', label: 'Link elsewhere (affiliate)' },
                  ]}
                />
                {ctaMode === 'external' ? (
                  <p className="text-xs text-muted-foreground">
                    You do not sell this — the button links out. It cannot be added to a basket
                    or ordered here, and its stock is ignored.
                  </p>
                ) : ctaMode === 'buy_now' ? (
                  <p className="text-xs text-muted-foreground">
                    Adds to the basket and goes straight to checkout.
                  </p>
                ) : null}
              </div>

              {ctaMode === 'external' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="product-external-url">Link</Label>
                    <Input
                      id="product-external-url"
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      placeholder="https://partner.example/product"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your affiliate URL. Marked <code>nofollow sponsored</code> automatically —
                      a paid link has to say so.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-external-label">Button text</Label>
                    <Input
                      id="product-external-label"
                      value={externalLabel}
                      onChange={(e) => setExternalLabel(e.target.value)}
                      placeholder="Buy on Amazon"
                    />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {categoryOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No categories yet.</p>
              ) : (
                categoryOptions.map((option) => {
                  const checked = categoryIds.includes(option.value)
                  return (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setCategoryIds((prev) =>
                            e.target.checked
                              ? [...prev, option.value]
                              : prev.filter((id) => id !== option.value)
                          )
                        }
                        className="size-4 rounded border-border"
                      />
                      {option.label}
                    </label>
                  )
                })
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className="text-sm text-green-600 dark:text-green-500" role="status">
                Saved.
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={saveProduct.isPending}>
              {saveProduct.isPending ? 'Saving…' : isNew ? 'Create product' : 'Save product'}
            </Button>
          </div>
        </div>
      </form>

      <MediaImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(url) => {
          setImages((prev) => [...prev, { mediaUrl: url, alt: null }])
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

/** The editable fields of one variant. */
function VariantFields({
  draft,
  currency,
  onChange,
}: {
  draft: VariantDraft
  currency: string
  onChange: (patch: Partial<VariantDraft>) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Variant name</Label>
          <Input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>SKU</Label>
          <Input
            value={draft.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Price</Label>
          {/* Emits integer minor units — the browser never handles a float price. */}
          <MoneyInput
            value={draft.priceAmount}
            currency={currency}
            onChange={(v) => onChange({ priceAmount: v })}
          />
        </div>
        <div className="space-y-2">
          <Label>Compare at</Label>
          <MoneyInput
            value={draft.compareAtAmount}
            currency={currency}
            onChange={(v) => onChange({ compareAtAmount: v })}
          />
        </div>
        <div className="space-y-2">
          <Label>Cost</Label>
          <MoneyInput
            value={draft.costAmount}
            currency={currency}
            onChange={(v) => onChange({ costAmount: v })}
          />
          <p className="text-xs text-muted-foreground">Internal only.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Stock on hand</Label>
          <Input
            inputMode="numeric"
            value={String(draft.stockOnHand)}
            onChange={(e) => {
              const next = Number(e.target.value.replace(/[^\d]/g, ''))
              onChange({ stockOnHand: Number.isFinite(next) ? next : 0 })
            }}
            disabled={!draft.trackInventory}
          />
        </div>
        <div className="flex items-end">
          <label className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            Track inventory
            <Switch
              checked={draft.trackInventory}
              onCheckedChange={(v) => onChange({ trackInventory: v })}
            />
          </label>
        </div>
        <div className="flex items-end">
          <label className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            Allow backorder
            <Switch
              checked={draft.allowBackorder}
              onCheckedChange={(v) => onChange({ allowBackorder: v })}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
