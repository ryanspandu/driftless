import { DateTime } from 'luxon'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const settings = new StoreSettingsService()

/** Puck needs an id on every block; it is not derived from position. */
function block(type: string, props: Record<string, unknown>) {
  return { type, props: { id: `${type}-${newUlid().toLowerCase().slice(-10)}`, ...props } }
}

/**
 * The shop front a store gets on day one.
 *
 * Composed from ordinary blocks, so the operator can rearrange, restyle or
 * delete any of it in the builder. Nothing here is special-cased — it is the
 * same document a person would have built by hand, which is the point: the
 * default is a starting position, not a fixed template.
 */
function shopFrontContent(storeName: string) {
  return {
    root: { props: {} },
    zones: {},
    content: [
      block('Section', {
        padding: '64px 24px',
        content: [
          block('Container', {
            maxWidth: '1100px',
            padding: '0 16px',
            content: [
              block('Heading', { text: storeName, level: '1', marginBottom: '12px' }),
              block('Paragraph', {
                text: 'Everything we make, in one place.',
                color: '#52525b',
                marginBottom: '24px',
              }),
              block('Button', { label: 'View the basket', href: '/shop/cart', variant: 'secondary' }),
            ],
          }),
        ],
      }),

      block('Section', {
        padding: '0 24px 64px 24px',
        content: [
          block('Container', {
            maxWidth: '1100px',
            padding: '0 16px',
            content: [
              /**
               * Blank `source` means the whole catalogue. A new store has no
               * categories yet, and a default pointing at one that does not
               * exist would render an empty shop on first load.
               */
              block('ProductList', {
                heading: 'Shop',
                source: {},
                limit: 12,
                columns: '3',
              }),
            ],
          }),
        ],
      }),
    ],
  }
}

/**
 * A product page that works for every product.
 *
 * One `ProductDetail` with **no slug** — `/shop/p/:slug` binds the URL's
 * product per request. Filling the slug in here would pin the template to a
 * single product, which is exactly the arrangement this replaced.
 */
function productTemplateContent() {
  return {
    root: { props: {} },
    zones: {},
    content: [
      block('Section', {
        padding: '48px 24px',
        content: [
          block('Container', {
            maxWidth: '1100px',
            padding: '0 16px',
            content: [block('ProductDetail', { slug: '' })],
          }),
        ],
      }),
    ],
  }
}

export interface SeedResult {
  shopPageId: string | null
  productPageId: string | null
  created: string[]
}

/**
 * First-run storefront pages, created when the module is enabled.
 *
 * Every step is skipped when something is already there. The operator's shop is
 * theirs — toggling the module off and on must never restore a page they
 * deleted on purpose, or undo edits to one they kept.
 */
export default class StorefrontSeederService {
  async seed(): Promise<SeedResult> {
    const store = await settings.getOrCreate()
    const created: string[] = []

    const storeName = store.storeName?.trim() || 'Shop'

    const shopPageId = await this.ensurePage({
      existingId: store.shopPageId,
      path: 'shop-front',
      title: `${storeName} — shop`,
      seo: {
        title: `${storeName} — shop`,
        description: 'Browse everything we sell.',
      },
      content: shopFrontContent(storeName),
      created,
      label: 'shop front',
    })

    const productPageId = await this.ensurePage({
      existingId: store.productPageId,
      path: 'shop-product',
      title: 'Product page',
      seo: {},
      content: productTemplateContent(),
      created,
      label: 'product template',
    })

    /**
     * Only written when something actually changed, so re-enabling a module
     * whose pages were deliberately unset does not silently re-point it.
     */
    if (shopPageId !== store.shopPageId || productPageId !== store.productPageId) {
      store.shopPageId = shopPageId
      store.productPageId = productPageId
      await store.save()
    }

    return { shopPageId, productPageId, created }
  }

  /**
   * Returns the id to use, creating a page only when there is genuinely none.
   *
   * Three ways out before creating anything: the setting already points
   * somewhere live, a page already sits at that path, or — failing both — a new
   * one is made. The path check matters because an operator may have deleted
   * the *setting* while keeping the page.
   */
  private async ensurePage(input: {
    existingId: string | null
    path: string
    title: string
    seo: Record<string, unknown>
    content: Record<string, unknown>
    created: string[]
    label: string
  }): Promise<string> {
    if (input.existingId) {
      const current = await Page.query()
        .where('id', input.existingId)
        .whereNull('deleted_at')
        .first()
      if (current) return current.id
    }

    const atPath = await Page.query().where('path', input.path).whereNull('deleted_at').first()
    if (atPath) return atPath.id

    const page = await Page.create({
      id: newUlid(),
      title: input.title,
      path: input.path,
      status: 'PUBLISHED',
      /**
       * SSR, not SSG. Both of these render live prices and stock; a snapshot
       * would bake in figures that go stale, and the commerce resolvers are
       * marked volatile precisely so that cannot happen silently.
       */
      renderMode: 'SSR',
      content: input.content,
      seo: input.seo,
      publishedAt: DateTime.now(),
    })

    input.created.push(input.label)
    return page.id
  }
}
