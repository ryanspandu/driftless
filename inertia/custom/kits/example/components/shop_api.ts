/**
 * A small, decoupled client for the e-commerce module's public storefront API.
 *
 * A kit **cannot import the module** (`@modules` is not a kit alias, and core/kits
 * never import module code — see docs/ai/modules.md), so this mirrors
 * `modules/ecommerce/ui/storefront/_api.ts` locally. Copy it into your own kit.
 *
 * Plain `fetch`, NOT the admin `apiFetch`: a storefront 401 must not bounce a
 * shopper to `/login`. CSRF still applies, so the `XSRF-TOKEN` cookie is echoed as
 * `X-XSRF-TOKEN`. Every call throws `ShopError` with a `.status`; **404 means the
 * store is disabled or absent** (`moduleEnabled` middleware), so branch on it and
 * degrade gracefully. The client never sends a price — the server prices the cart.
 */

export interface MoneyDto {
  amount: number
  currency: string
  formatted: string
}

export interface ProductVariant {
  id: string
  title: string
  optionValues: Record<string, string>
  price: MoneyDto
  compareAt: MoneyDto | null
  imageUrl: string | null
  availability: 'in_stock' | 'low_stock' | 'out_of_stock'
  remaining: number | null
}

export interface Product {
  id: string
  slug: string
  title: string
  subtitle: string | null
  type: 'physical' | 'digital'
  priceFrom: MoneyDto | null
  images: { url: string; alt: string | null }[]
  variants: ProductVariant[]
  options: { name: string; values: string[] }[]
  featured: boolean
}

export interface ProductsPage {
  items: Product[]
  total: number
  page: number
  pageSize: number
}

export interface CartLine {
  variantId: string
  productId: string
  slug: string
  title: string
  variantTitle: string
  imageUrl: string | null
  quantity: number
  unit: MoneyDto
  total: MoneyDto
  unavailable: boolean
}

export interface Cart {
  lines: CartLine[]
  currency: string
  subtotal: MoneyDto
  discount: MoneyDto
  tax: MoneyDto
  total: MoneyDto
  itemCount: number
  digitalOnly: boolean
}

export interface CheckoutConfig {
  gateways: ('stripe' | 'paypal' | 'lemonsqueezy')[]
  digitalOnly: boolean
}

export interface CheckoutResult {
  orderId: string
  orderNumber: string
  accessToken: string
  /** Where to send the shopper next — the gateway's hosted page, or the order page for a zero-total. */
  redirectUrl: string
  total: MoneyDto
  paid: boolean
}

export interface CheckoutBody {
  email: string
  gateway: string
  shippingAddress?: Record<string, unknown>
  billingAddress?: Record<string, unknown>
  customerNote?: string
  discountCode?: string
  shippingMethodId?: string
}

/** A signed-in shopper. Storefront accounts are SEPARATE from admin users. */
export interface Account {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string
  ordersCount: number
  memberSince: string | null
}

export interface AccountOrder {
  number: string
  status: string
  placedAt: string
  total: MoneyDto
  itemCount: number
}

export class ShopError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

/** Whether an error is a "store is off / absent" 404 from the module gate. */
export function isStoreOff(err: unknown): boolean {
  return err instanceof ShopError && err.status === 404
}

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]!) : undefined
}

async function shopFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (options.body) headers['Content-Type'] = 'application/json'
  const token = csrfToken()
  if (token) headers['X-XSRF-TOKEN'] = token
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  if (!response.ok) {
    let message = 'Something went wrong.'
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // Non-JSON error body; the generic message stands.
    }
    throw new ShopError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** One key per checkout FORM, not per submit — a double-click replays, never double-charges. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `ck_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export const shop = {
  getProducts: (params: { page?: number; pageSize?: number; search?: string } = {}) => {
    const p = new URLSearchParams({
      page: String(params.page ?? 1),
      pageSize: String(params.pageSize ?? 12),
    })
    if (params.search) p.set('search', params.search)
    return shopFetch<ProductsPage>(`/api/shop/products?${p.toString()}`)
  },
  getProduct: (slug: string) =>
    shopFetch<Product>(`/api/shop/products/${encodeURIComponent(slug)}`),
  getCart: () => shopFetch<Cart>('/api/shop/cart'),
  addToCart: (variantId: string, quantity = 1) =>
    shopFetch<Cart>('/api/shop/cart/items', {
      method: 'POST',
      body: JSON.stringify({ variantId, quantity }),
    }),
  setQuantity: (variantId: string, quantity: number) =>
    shopFetch<Cart>('/api/shop/cart/items', {
      method: 'PUT',
      body: JSON.stringify({ variantId, quantity }),
    }),
  removeLine: (variantId: string) =>
    shopFetch<Cart>(`/api/shop/cart/items/${encodeURIComponent(variantId)}`, { method: 'DELETE' }),
  getCheckoutConfig: () => shopFetch<CheckoutConfig>('/api/shop/checkout/config'),
  checkout: (body: CheckoutBody, idempotencyKey: string) =>
    shopFetch<CheckoutResult>('/api/shop/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  // ── Customer account (a separate storefront login, not the admin users) ──
  // `me` never 401s — it returns { account: null } when signed out.
  me: () => shopFetch<{ account: Account | null }>('/api/shop/me'),
  register: (input: { email: string; password: string; firstName?: string; lastName?: string }) =>
    shopFetch<{ account: Account | null; message?: string }>('/api/shop/account/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  // Success → { account }. A 2FA account → { needs2fa, pendingToken } (a 200, not an error).
  // Wrong details → 401 (thrown as ShopError).
  login: (input: { email: string; password: string }) =>
    shopFetch<{ ok?: boolean; account?: Account; needs2fa?: boolean; pendingToken?: string }>(
      '/api/shop/account/login',
      { method: 'POST', body: JSON.stringify(input) }
    ),
  verify2fa: (input: { pendingToken: string; code: string }) =>
    shopFetch<{ account: Account }>('/api/shop/account/2fa/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () => shopFetch<{ ok: true }>('/api/shop/account/logout', { method: 'POST' }),
  getOrders: () => shopFetch<{ orders: AccountOrder[] }>('/api/shop/account/orders'),
}
