/**
 * Storefront client.
 *
 * Plain `fetch` rather than the admin's axios wrapper: these pages are public,
 * and the shared client redirects to `/login` on a 401 — which would throw an
 * anonymous shopper into the admin login form.
 *
 * CSRF still applies (these are cookie-bearing browser requests), so the token
 * is read from the `XSRF-TOKEN` cookie and echoed, the same way
 * `inertia/lib/api.ts` does for the admin.
 */

export interface MoneyDto {
  amount: number
  currency: string
  formatted: string
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

export interface CartDto {
  lines: CartLine[]
  currency: string
  subtotal: MoneyDto
  discount: MoneyDto
  tax: MoneyDto
  total: MoneyDto
  itemCount: number
  digitalOnly: boolean
  email: string | null
}

export interface OrderStatusDto {
  number: string
  paid: boolean
  status: string
  paymentStatus: string
  email: string
  placedAt: string
  /** Present once the order has shipped. */
  shippedAt: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  total: MoneyDto
  subtotal: MoneyDto
  shipping: MoneyDto
  tax: MoneyDto
  items: {
    title: string
    variantTitle: string | null
    quantity: number
    total: MoneyDto
    imageUrl: string | null
  }[]
  /**
   * Present only once the order is paid. `url` is built by the server and
   * already carries the order token — the browser must never assemble it.
   */
  downloads: {
    id: string
    filename: string
    sizeBytes: number | null
    downloadsCount: number
    maxDownloads: number
    expiresAt: string | null
    live: boolean
    url: string | null
  }[]
}

export interface CustomerDto {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string
  acceptsMarketing: boolean
  ordersCount: number
}

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]!) : undefined
}

export class ShopError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly reason?: string
  ) {
    super(message)
  }
}

export async function shopFetch<T>(
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
    let reason: string | undefined

    try {
      const body = (await response.json()) as { message?: string; reason?: string }
      if (body.message) message = body.message
      reason = body.reason
    } catch {
      // Non-JSON error body; the generic message stands.
    }

    throw new ShopError(response.status, message, reason)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * A key for one checkout attempt.
 *
 * Generated once per checkout *form*, not per submit, so pressing the button
 * twice replays the first response instead of creating a second order. A new
 * key is only minted when the shopper starts over.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ck_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export const shopApi = {
  cart: () => shopFetch<CartDto>('/api/shop/cart'),

  addToCart: (variantId: string, quantity = 1) =>
    shopFetch<CartDto>('/api/shop/cart/items', {
      method: 'POST',
      body: JSON.stringify({ variantId, quantity }),
    }),

  setQuantity: (variantId: string, quantity: number) =>
    shopFetch<CartDto>('/api/shop/cart/items', {
      method: 'PUT',
      body: JSON.stringify({ variantId, quantity }),
    }),

  removeLine: (variantId: string) =>
    shopFetch<CartDto>(`/api/shop/cart/items/${variantId}`, { method: 'DELETE' }),

  me: () => shopFetch<{ customer: CustomerDto | null }>('/api/shop/me'),

  orderStatus: (token: string) =>
    shopFetch<OrderStatusDto>(`/api/shop/order?token=${encodeURIComponent(token)}`),
}

/** A delivery option quoted by the server for one address and basket. */
export interface ShippingOptionDto {
  methodId: string
  name: string
  description: string | null
  price: MoneyDto
  minDeliveryDays: number | null
  maxDeliveryDays: number | null
  /** True when a free-shipping threshold zeroed an otherwise paid rate. */
  free: boolean
}

/** One order in the signed-in buyer's history. */
export interface AccountOrderDto {
  number: string
  status: string
  paymentStatus: string
  placedAt: string
  total: MoneyDto
  itemCount: number
  items: {
    title: string
    variantTitle: string | null
    quantity: number
    imageUrl: string | null
  }[]
}

export const accountApi = {
  register: (input: {
    email: string
    password: string
    firstName?: string | null
    lastName?: string | null
    acceptsMarketing?: boolean
  }) =>
    shopFetch<{ customer: CustomerDto }>('/api/shop/account/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  login: (input: { email: string; password: string }) =>
    shopFetch<{ customer: CustomerDto }>('/api/shop/account/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  logout: () => shopFetch<{ ok: true }>('/api/shop/account/logout', { method: 'POST' }),

  orders: () => shopFetch<{ orders: AccountOrderDto[] }>('/api/shop/account/orders'),
}
