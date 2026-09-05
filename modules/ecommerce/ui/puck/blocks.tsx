import {
  CircleUser,
  CreditCard,
  LogIn,
  Package,
  ReceiptText,
  Share2,
  ShoppingBag,
  ShoppingCart,
  UserPlus,
} from 'lucide-react'
import type { ModulePuckBlocks } from '~/puck/module-blocks'
import { styleFields, Box } from '~/puck/style-fields'
import { CartWidget, ProductDetail, ProductList } from './product-blocks'
import {
  AccountBlockView,
  AffiliateBlockView,
  CartBlockView,
  CheckoutBlockView,
  LoginBlockView,
  OrderStatusBlockView,
  RegisterBlockView,
  ScreenPlaceholder,
} from './screen-blocks'

/** True when the block is drawn in the builder canvas rather than a live page. */
const isEditing = (s: Record<string, unknown>): boolean =>
  !!(s.puck as { isEditing?: boolean } | undefined)?.isEditing

/**
 * The e-commerce module's contribution to the page builder.
 *
 * Lives here rather than in `inertia/puck/config.tsx` so the module is a folder
 * you can copy in — core discovers this file by shape, never by name. See
 * `inertia/puck/module-blocks.ts`.
 */
export default {
  category: { key: 'commerce', title: 'Commerce' },
  /**
   * Glyphs for the drawer tiles / Layers rows. Core's icon map cannot list these
   * without naming the module, so they travel with the blocks.
   */
  icons: {
    ProductList: ShoppingBag,
    ProductDetail: Package,
    CartWidget: ShoppingCart,
    CartBlock: ShoppingCart,
    CheckoutBlock: CreditCard,
    OrderStatusBlock: ReceiptText,
    AccountBlock: CircleUser,
    AffiliateBlock: Share2,
    LoginBlock: LogIn,
    RegisterBlock: UserPlus,
  },
  components: {
    /**
     * Commerce blocks.
     *
     * Their data is resolved server-side by the e-commerce module's registered
     * resolvers, and read back through `BlockDataContext` — so an SSR page ships
     * products in its initial HTML. On SSG pages price and stock are withheld
     * from the snapshot deliberately and hydrated client-side instead.
     */
    ProductList: {
      label: 'Product List',
      fields: {
        heading: { type: 'text', label: 'Heading' },
        subheading: { type: 'textarea', label: 'Sub-heading (right of the heading)' },
        ctaLabel: { type: 'text', label: 'Header link label (e.g. View all)' },
        ctaHref: { type: 'text', label: 'Header link URL' },
        source: {
          type: 'object',
          label: 'Products',
          objectFields: {
            categorySlug: { type: 'text', label: 'Category slug (blank = all)' },
            featured: {
              type: 'radio',
              label: 'Featured only',
              options: [
                { label: 'No', value: false },
                { label: 'Yes', value: true },
              ],
            },
            sort: {
              type: 'select',
              label: 'Sort',
              options: [
                { label: 'Default', value: '' },
                { label: 'Price: low to high', value: 'price_asc' },
                { label: 'Price: high to low', value: 'price_desc' },
                { label: 'Title', value: 'title' },
              ],
            },
          },
        },
        limit: { type: 'number', label: 'Max items' },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [2, 3, 4].map((n) => ({ label: String(n), value: String(n) })),
        },
        ...styleFields,
      },
      defaultProps: {
        heading: '',
        subheading: '',
        ctaLabel: '',
        ctaHref: '',
        source: {},
        limit: 8,
        columns: '3',
      },
      render: ({ heading, subheading, ctaLabel, ctaHref, source, limit, columns, ...s }) => (
        <Box s={s}>
          <ProductList
            heading={heading}
            subheading={subheading}
            ctaLabel={ctaLabel}
            ctaHref={ctaHref}
            source={source}
            limit={limit}
            columns={columns}
          />
        </Box>
      ),
    },

    ProductDetail: {
      label: 'Product Detail',
      fields: {
        slug: {
          type: 'text',
          label: 'Product slug (leave blank on a product template)',
        },
        ...styleFields,
      },
      defaultProps: { slug: '' },
      render: ({ slug, ...s }) => (
        <Box s={s}>
          {/*
          The builder canvas has no route to bind to, so a blank slug resolves to
          nothing there. `editing` lets the block say why instead of claiming the
          product is gone — which is what every operator saw on the seeded
          product-page template.
        */}
          <ProductDetail
            slug={slug}
            editing={!!(s.puck as { isEditing?: boolean } | undefined)?.isEditing}
          />
        </Box>
      ),
    },

    CartWidget: {
      label: 'Basket Link',
      fields: {
        label: { type: 'text', label: 'Label' },
        ...styleFields,
      },
      defaultProps: { label: 'Basket' },
      render: ({ label, ...s }) => (
        <Box s={s}>
          <CartWidget label={label} />
        </Box>
      ),
    },

    /**
     * The full storefront application screens, for pages that override the
     * built-in `/shop/cart`, `/shop/checkout`, `/shop/order` and `/shop/account`.
     * Self-contained (no fields) — the interactive UI is client-fetched and
     * per-visitor, so a placeholder stands in while editing.
     */
    CartBlock: {
      label: 'Basket',
      fields: { ...styleFields },
      defaultProps: {},
      render: (s) => (
        <Box s={s}>
          {isEditing(s) ? (
            <ScreenPlaceholder
              label="Basket"
              hint="The shopper's basket renders here on the live page."
            />
          ) : (
            <CartBlockView />
          )}
        </Box>
      ),
    },

    CheckoutBlock: {
      label: 'Checkout',
      fields: { ...styleFields },
      defaultProps: {},
      render: (s) => (
        <Box s={s}>
          {isEditing(s) ? (
            <ScreenPlaceholder
              label="Checkout"
              hint="The checkout form renders here on the live page."
            />
          ) : (
            <CheckoutBlockView />
          )}
        </Box>
      ),
    },

    OrderStatusBlock: {
      label: 'Order Status',
      fields: { ...styleFields },
      defaultProps: {},
      render: (s) => (
        <Box s={s}>
          {isEditing(s) ? (
            <ScreenPlaceholder
              label="Order status"
              hint="A shopper's order, opened by the link in their email, renders here."
            />
          ) : (
            <OrderStatusBlockView />
          )}
        </Box>
      ),
    },

    AccountBlock: {
      label: 'Account',
      fields: { ...styleFields },
      defaultProps: {},
      render: (s) => (
        <Box s={s}>
          {isEditing(s) ? (
            <ScreenPlaceholder
              label="Account"
              hint="The signed-in shopper's profile renders here."
            />
          ) : (
            <AccountBlockView />
          )}
        </Box>
      ),
    },

    LoginBlock: {
      label: 'Sign in',
      fields: { ...styleFields },
      defaultProps: {},
      render: (s) => (
        <Box s={s}>
          {isEditing(s) ? (
            <ScreenPlaceholder label="Sign in" hint="The shopper sign-in form renders here." />
          ) : (
            <LoginBlockView />
          )}
        </Box>
      ),
    },

    RegisterBlock: {
      label: 'Sign up',
      fields: { ...styleFields },
      defaultProps: {},
      render: (s) => (
        <Box s={s}>
          {isEditing(s) ? (
            <ScreenPlaceholder label="Sign up" hint="The shopper sign-up form renders here." />
          ) : (
            <RegisterBlockView />
          )}
        </Box>
      ),
    },

    AffiliateBlock: {
      label: 'Affiliate program',
      fields: { ...styleFields },
      defaultProps: {},
      render: (s) => (
        <Box s={s}>
          {isEditing(s) ? (
            <ScreenPlaceholder
              label="Affiliate program"
              hint="Apply, referral link, commissions and payouts render here for the signed-in shopper."
            />
          ) : (
            <AffiliateBlockView />
          )}
        </Box>
      ),
    },
  },
} satisfies ModulePuckBlocks
