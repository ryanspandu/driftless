import { usePage } from '@inertiajs/react'
import { StorefrontLayout } from './_layout'

/**
 * Category / tag product archive — the built-in default at `/shop/category/:slug`
 * and `/shop/tag/:slug`.
 *
 * Server-rendered: the controller resolves the taxonomy and its products and
 * passes them as props, so the listing is in the initial HTML for SEO rather
 * than fetched client-side. An operator who wants a designed archive assigns a
 * builder page to the `categoryPageId` / `tagPageId` slot, and this screen is
 * never reached — the same override arrangement as the other storefront screens.
 */

interface ArchiveProduct {
  id: string
  slug: string
  title: string
  subtitle: string | null
  priceFrom: { formatted: string } | null
  images: { url: string; alt: string | null }[]
}

interface ArchiveTaxonomy {
  kind: 'category' | 'tag'
  slug: string
  name: string
  description: string | null
}

interface ArchiveProps {
  taxonomy: ArchiveTaxonomy
  products: ArchiveProduct[]
  total: number
}

function ArchiveScreen() {
  const { taxonomy, products, total } = usePage().props as unknown as ArchiveProps

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {taxonomy.kind === 'category' ? 'Category' : 'Tag'}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{taxonomy.name}</h1>
        {taxonomy.description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{taxonomy.description}</p>
        ) : null}
        <p className="mt-3 text-sm text-muted-foreground">
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>

      {products.length === 0 ? (
        <p className="mt-12 text-sm text-muted-foreground">
          Nothing here yet — check back soon.
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <a href={`/shop/p/${product.slug}`} className="group block">
                <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                  {product.images[0] ? (
                    <img
                      src={product.images[0].url}
                      alt={product.images[0].alt ?? ''}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : null}
                </div>
                <h2 className="mt-3 text-sm font-medium group-hover:underline">{product.title}</h2>
                {product.subtitle ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {product.subtitle}
                  </p>
                ) : null}
                {product.priceFrom ? (
                  <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                    {product.priceFrom.formatted}
                  </p>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ArchivePage() {
  const { taxonomy } = usePage().props as unknown as ArchiveProps
  return (
    <StorefrontLayout title={taxonomy.name}>
      <ArchiveScreen />
    </StorefrontLayout>
  )
}
