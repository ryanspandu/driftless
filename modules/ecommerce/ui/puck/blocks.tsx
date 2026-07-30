import type { ModulePuckBlocks } from '~/puck/module-blocks'
import { styleFields, Box } from '~/puck/style-fields'
import { CartWidget, ProductDetail, ProductList } from './product-blocks'

/**
 * The e-commerce module's contribution to the page builder.
 *
 * Lives here rather than in `inertia/puck/config.tsx` so the module is a folder
 * you can copy in — core discovers this file by shape, never by name. See
 * `inertia/puck/module-blocks.ts`.
 */
export default {
  category: { key: 'commerce', title: 'Commerce' },
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
    defaultProps: { heading: '', source: {}, limit: 8, columns: '3' },
    render: ({ heading, source, limit, columns, ...s }) => (
      <Box s={s}>
        <ProductList heading={heading} source={source} limit={limit} columns={columns} />
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
        <ProductDetail slug={slug} />
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
  },
} satisfies ModulePuckBlocks
