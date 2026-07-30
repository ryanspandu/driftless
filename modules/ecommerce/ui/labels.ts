import type { ModulePageLabels } from '~/lib/module-labels'

/**
 * What the admin breadcrumb calls this module's pages.
 *
 * Lives here rather than in core's `header.tsx` so the module stays a folder
 * you can copy in — see `inertia/lib/module-labels.ts`.
 */
export default {
  exact: {
    '/admin/ecommerce': 'E-commerce',
    '/admin/ecommerce/products': 'Products',
    '/admin/ecommerce/products/categories': 'Categories',
    '/admin/ecommerce/orders': 'Orders',
    // Listed explicitly so it beats the `/orders/` prefix rule below, which
    // would otherwise label the create screen "Order".
    '/admin/ecommerce/orders/new': 'New order',
    '/admin/ecommerce/customers': 'Customers',
    '/admin/ecommerce/settings': 'Store settings',
    '/admin/marketing/discounts': 'Discounts',
    '/admin/marketing/affiliates': 'Affiliates',
    '/admin/marketing/commissions': 'Commissions',
  },
  prefix: [
    { path: '/admin/ecommerce/products/', label: 'Product' },
    { path: '/admin/ecommerce/orders/', label: 'Order' },
  ],
} satisfies ModulePageLabels
