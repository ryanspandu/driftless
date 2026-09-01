/**
 * Client types and hooks for the e-commerce admin.
 *
 * Types are re-declared here rather than imported from the server: module UI is
 * a separate TypeScript project (`modules/tsconfig.json`) with no path into
 * `app/`, and the repo already follows this convention for the client boundary
 * (`inertia/types/api.ts` mirrors server DTOs the same way).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'
import api, { ApiError } from '~/lib/api'
import type { MoneyDto } from '../lib/money'

export type ProductType = 'physical' | 'digital'
export type ProductStatus = 'draft' | 'active' | 'archived'

export interface ProductOption {
  name: string
  values: string[]
}

export interface VariantDto {
  id: string
  productId: string
  title: string
  sku: string | null
  price: MoneyDto
  compareAt: MoneyDto | null
  cost: MoneyDto | null
  weightGrams: number | null
  optionValues: Record<string, string>
  stockOnHand: number
  stockReserved: number
  /** Null when inventory is not tracked (i.e. effectively unlimited). */
  available: number | null
  trackInventory: boolean
  allowBackorder: boolean
  imageUrl: string | null
  position: number
}

export interface ProductImageDto {
  id: string
  mediaUrl: string
  alt: string | null
  position: number
}

export interface ProductDto {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: Record<string, unknown>
  type: ProductType
  status: ProductStatus
  currency: string
  priceFrom: MoneyDto | null
  seo: Record<string, unknown>
  options: ProductOption[]
  featured: boolean
  /** What the buy button does. `external` = affiliate link, not sold here. */
  ctaMode: 'add_to_cart' | 'buy_now' | 'external'
  externalUrl: string | null
  externalLabel: string | null
  position: number
  variants: VariantDto[]
  images: ProductImageDto[]
  categoryIds: string[]
  totalStock: number | null
  createdAt: string
  updatedAt: string
}

export interface CategoryDto {
  id: string
  slug: string
  name: string
  description: string | null
  imageUrl: string | null
  parentId: string | null
  position: number
  productCount: number
}

export interface UpdateStoreSettingsInput extends Partial<StoreSettingsDto> {
  /**
   * Acknowledges that changing the base currency reinterprets every stored
   * price. Only needed when the server says so.
   */
  confirmRepricing?: boolean
}

export interface StoreSettingsDto {
  storeName: string | null
  storeEmail: string | null
  supportEmail: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  currency: string
  locale: string
  taxRatePercent: number
  taxInclusive: boolean
  taxLabel: string
  checkoutTtlMinutes: number
  refundWindowDays: number
  affiliateCookieDays: number
  orderNumberPrefix: string
  /** Builder page used as the product-detail template. Null = no product pages. */
  productPageId: string | null
  /** Builder page served at `/shop`. Null = no shop front. */
  shopPageId: string | null
  /**
   * Optional builder-page overrides for the storefront app screens. Null serves
   * the built-in fixed screen; a page id renders that page at the screen's URL.
   */
  cartPageId: string | null
  checkoutPageId: string | null
  orderPageId: string | null
  accountPageId: string | null
  loginPageId: string | null
  registerPageId: string | null
}

export interface StoreStatsDto {
  currency: string
  revenue: MoneyDto
  averageOrderValue: MoneyDto
  ordersCount: number
  paidOrdersCount: number
  pendingOrdersCount: number
  productsCount: number
  activeProductsCount: number
  lowStockCount: number
  customersCount: number
}

export interface ProductListResult {
  items: ProductDto[]
  total: number
  page: number
  pageSize: number
}

export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'fulfilled'
  | 'completed'
  | 'cancelled'

export type PaymentStatus =
  | 'unpaid'
  | 'authorized'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'failed'

export interface AddressSnapshot {
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  line1?: string
  line2?: string | null
  city?: string
  state?: string | null
  postalCode?: string | null
  country?: string
  phone?: string | null
}

/**
 * The bucket an order sits in, derived server-side — see `stageOf`. The list
 * filter and the row badge both read this, so they cannot drift apart.
 */
export type OrderStage = 'action' | 'open' | 'closed'

export interface OrderListItemDto {
  id: string
  number: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  fulfillmentStatus: string
  stage: OrderStage
  email: string
  customerId: string | null
  total: MoneyDto
  refunded: MoneyDto
  itemCount: number
  createdAt: string
  paidAt: string | null
}

export interface OrderItemDto {
  id: string
  title: string
  variantTitle: string | null
  sku: string | null
  imageUrl: string | null
  productType: 'physical' | 'digital'
  quantity: number
  refundedQuantity: number
  unit: MoneyDto
  subtotal: MoneyDto
  discount: MoneyDto
  tax: MoneyDto
  total: MoneyDto
}

export interface OrderEventDto {
  id: string
  type: string
  fromStatus: string | null
  toStatus: string | null
  message: string | null
  actorType: string
  actorLabel: string | null
  createdAt: string
}

export interface OrderPaymentDto {
  id: string
  gateway: string
  mode: string
  status: string
  amount: MoneyDto
  gatewayPaymentId: string
  capturedAt: string | null
  failureMessage: string | null
}

export interface OrderRefundDto {
  id: string
  amount: MoneyDto
  reason: string | null
  status: string
  createdAt: string
}

export interface OrderDetailDto extends OrderListItemDto {
  subtotal: MoneyDto
  discount: MoneyDto
  shipping: MoneyDto
  tax: MoneyDto
  refundable: MoneyDto
  shippingAddress: AddressSnapshot
  billingAddress: AddressSnapshot
  discountCode: string | null
  affiliateCode: string | null
  shippingMethodLabel: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  customerNote: string | null
  internalNote: string | null
  reservationExpiresAt: string | null
  items: OrderItemDto[]
  events: OrderEventDto[]
  payments: OrderPaymentDto[]
  refunds: OrderRefundDto[]
}

export interface GatewayCredentialDto {
  gateway: 'stripe' | 'paypal'
  mode: 'test' | 'live'
  enabled: boolean
  publicKey: string | null
  secretKeyMasked: string | null
  hasSecretKey: boolean
  hasWebhookSecret: boolean
  connectedAt: string | null
  lastVerifiedAt: string | null
  lastVerifyError: string | null
}

export const ecommerceKeys = {
  products: (query: string) => ['ecommerce', 'products', query] as const,
  product: (id: string) => ['ecommerce', 'product', id] as const,
  categories: ['ecommerce', 'categories'] as const,
  settings: ['ecommerce', 'settings'] as const,
  stats: ['ecommerce', 'stats'] as const,
  orders: (query: string) => ['ecommerce', 'orders', query] as const,
  order: (id: string) => ['ecommerce', 'order', id] as const,
  gateways: ['ecommerce', 'gateways'] as const,
}

const BASE = '/api/admin/ecommerce'

export interface ProductQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: ProductStatus | 'all'
  type?: ProductType | 'all'
  categoryId?: string
}

function buildProductPath(query: ProductQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.status && query.status !== 'all') params.set('status', query.status)
  if (query.type && query.type !== 'all') params.set('type', query.type)
  if (query.categoryId) params.set('categoryId', query.categoryId)
  const qs = params.toString()
  return qs ? `${BASE}/products?${qs}` : `${BASE}/products`
}

export function useProducts(query: ProductQuery) {
  const path = buildProductPath(query)
  return useQuery({
    queryKey: ecommerceKeys.products(path),
    queryFn: () => apiFetch<ProductListResult>(path),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  })
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ecommerceKeys.product(id ?? 'new'),
    queryFn: () => apiFetch<ProductDto>(`${BASE}/products/${id}`),
    enabled: Boolean(id),
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ecommerceKeys.categories,
    queryFn: () => apiFetch<CategoryDto[]>(`${BASE}/categories`),
    staleTime: 60_000,
  })
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ecommerceKeys.settings,
    queryFn: () => apiFetch<StoreSettingsDto>(`${BASE}/settings`),
  })
}

/**
 * The store's display locale, or `undefined` until it has loaded.
 *
 * `undefined` is the right stand-in rather than a hard-coded `'en-US'`: `Intl`
 * treats it as "use the browser's", which is a better first paint than
 * committing to the wrong grouping and then changing it.
 *
 * Exists so `MoneyInput` can default to the store's locale instead of relying
 * on every call site to pass one — which none of them did.
 */
export function useStoreLocale(): string | undefined {
  return useStoreSettings().data?.locale || undefined
}

export function useStoreStats() {
  return useQuery({
    queryKey: ecommerceKeys.stats,
    queryFn: () => apiFetch<StoreStatsDto>(`${BASE}/stats`),
    staleTime: 30_000,
  })
}

/** Invalidate everything a product write could have changed. */
function invalidateProducts(qc: ReturnType<typeof useQueryClient>, id?: string) {
  void qc.invalidateQueries({ queryKey: ['ecommerce', 'products'] })
  void qc.invalidateQueries({ queryKey: ecommerceKeys.stats })
  if (id) void qc.invalidateQueries({ queryKey: ecommerceKeys.product(id) })
}

export interface ProductInput {
  title: string
  slug?: string
  subtitle?: string | null
  description?: Record<string, unknown>
  type?: ProductType
  status?: ProductStatus
  seo?: Record<string, unknown>
  options?: ProductOption[]
  featured?: boolean
  ctaMode?: 'add_to_cart' | 'buy_now' | 'external'
  /** Required when `ctaMode` is `external`; the server refuses without it. */
  externalUrl?: string | null
  externalLabel?: string | null
  categoryIds?: string[]
  images?: { mediaUrl: string; alt?: string | null }[]
}

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ProductInput }) =>
      id
        ? apiFetch<ProductDto>(`${BASE}/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
          })
        : apiFetch<ProductDto>(`${BASE}/products`, {
            method: 'POST',
            body: JSON.stringify(input),
          }),
    onSuccess: (product) => invalidateProducts(qc, product.id),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${BASE}/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateProducts(qc),
  })
}

/** The per-row outcome of a CSV import (mirrors `ProductImportService.ImportResult`). */
export interface ProductImportResult {
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

/**
 * Bulk product import. A multipart upload, so it goes through the axios instance
 * directly rather than `apiFetch` (which is JSON-only). A best-effort import is
 * still a 200 with a summary — the per-row `errors` live in the payload, not in
 * a thrown status — so success here means "the file was processed", and the
 * dialog reads the counts to tell the operator what actually happened.
 */
export function useImportProducts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      try {
        const res = await api.post<ProductImportResult>(`${BASE}/products/import`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
      } catch (err: unknown) {
        const ax = err as {
          response?: { status?: number; data?: { message?: string | string[] } }
        }
        const status = ax.response?.status ?? 500
        const raw = ax.response?.data?.message
        const msg = Array.isArray(raw) ? raw.join(', ') : raw
        throw new ApiError(status, msg ?? 'Import failed', ax.response?.data)
      }
    },
    onSuccess: () => invalidateProducts(qc),
  })
}

/** Amounts are integer minor units — the client never sends a decimal price. */
export interface VariantInput {
  title: string
  sku?: string | null
  priceAmount: number
  compareAtAmount?: number | null
  costAmount?: number | null
  weightGrams?: number | null
  optionValues?: Record<string, string>
  stockOnHand?: number
  trackInventory?: boolean
  allowBackorder?: boolean
  imageUrl?: string | null
  position?: number
}

export function useSaveVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      productId,
      variantId,
      input,
    }: {
      productId: string
      variantId: string | null
      input: VariantInput | Partial<VariantInput>
    }) =>
      variantId
        ? apiFetch<VariantDto>(`${BASE}/variants/${variantId}`, {
            method: 'PUT',
            body: JSON.stringify(input),
          })
        : apiFetch<VariantDto>(`${BASE}/products/${productId}/variants`, {
            method: 'POST',
            body: JSON.stringify(input),
          }),
    onSuccess: (variant) => invalidateProducts(qc, variant.productId),
  })
}

export function useDeleteVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ variantId }: { productId: string; variantId: string }) =>
      apiFetch<void>(`${BASE}/variants/${variantId}`, { method: 'DELETE' }),
    onSuccess: (_data, vars) => invalidateProducts(qc, vars.productId),
  })
}

export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Partial<CategoryDto> }) =>
      id
        ? apiFetch<CategoryDto>(`${BASE}/categories/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
          })
        : apiFetch<CategoryDto>(`${BASE}/categories`, {
            method: 'POST',
            body: JSON.stringify(input),
          }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ecommerceKeys.categories }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${BASE}/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ecommerceKeys.categories })
      void qc.invalidateQueries({ queryKey: ['ecommerce', 'products'] })
    },
  })
}

export function useUpdateStoreSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateStoreSettingsInput) =>
      apiFetch<StoreSettingsDto>(`${BASE}/settings`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ecommerceKeys.settings })
      // The currency list derives from the base, so it goes stale too.
      void qc.invalidateQueries({ queryKey: ['ecommerce', 'currencies'] })
    },
  })
}

// ── Orders ─────────────────────────────────────────────────────────────────

export interface OrderQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: OrderStatus | 'all'
  paymentStatus?: PaymentStatus | 'all'
  stage?: OrderStage | 'all'
}

export interface OrderListResult {
  items: OrderListItemDto[]
  total: number
  page: number
  pageSize: number
}

function buildOrderPath(query: OrderQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.status && query.status !== 'all') params.set('status', query.status)
  if (query.stage && query.stage !== 'all') params.set('stage', query.stage)
  if (query.paymentStatus && query.paymentStatus !== 'all') {
    params.set('paymentStatus', query.paymentStatus)
  }
  const qs = params.toString()
  return qs ? `${BASE}/orders?${qs}` : `${BASE}/orders`
}

export function useOrders(query: OrderQuery) {
  const path = buildOrderPath(query)
  return useQuery({
    queryKey: ecommerceKeys.orders(path),
    queryFn: () => apiFetch<OrderListResult>(path),
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  })
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ecommerceKeys.order(id ?? 'none'),
    queryFn: () => apiFetch<OrderDetailDto>(`${BASE}/orders/${id}`),
    enabled: Boolean(id),
  })
}

/** Every order mutation returns the refreshed detail, so the cache is seeded. */
function useOrderMutation<TInput>(
  request: (orderId: string, input: TInput) => Promise<OrderDetailDto>
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: TInput }) => request(orderId, input),
    onSuccess: (order) => {
      qc.setQueryData(ecommerceKeys.order(order.id), order)
      void qc.invalidateQueries({ queryKey: ['ecommerce', 'orders'] })
      void qc.invalidateQueries({ queryKey: ecommerceKeys.stats })
    },
  })
}

/** Amount is integer minor units — the browser never sends a decimal. */
export interface RefundInput {
  amount: number
  reason?: string | null
  restock?: boolean
}

export function useRefundOrder() {
  return useOrderMutation<RefundInput>((orderId, input) =>
    apiFetch<OrderDetailDto>(`${BASE}/orders/${orderId}/refund`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  )
}

export function useUpdateOrderStatus() {
  return useOrderMutation<{ status: 'confirmed' | 'fulfilled' | 'completed' }>((orderId, input) =>
    apiFetch<OrderDetailDto>(`${BASE}/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  )
}

export function useCancelOrder() {
  return useOrderMutation<{ reason?: string | null }>((orderId, input) =>
    apiFetch<OrderDetailDto>(`${BASE}/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  )
}

export function useUpdateOrderNote() {
  return useOrderMutation<{ internalNote: string | null }>((orderId, input) =>
    apiFetch<OrderDetailDto>(`${BASE}/orders/${orderId}/note`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  )
}

// ── Payment gateways ───────────────────────────────────────────────────────

export function useGateways() {
  return useQuery({
    queryKey: ecommerceKeys.gateways,
    queryFn: () => apiFetch<GatewayCredentialDto[]>(`${BASE}/gateways`),
  })
}

export interface UpdateGatewayInput {
  enabled?: boolean
  publicKey?: string | null
  /** Only send when the operator typed one — omitting keeps the stored key. */
  secretKey?: string | null
  webhookSecret?: string | null
}

export function useUpdateGateway() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      gateway,
      mode,
      input,
    }: {
      gateway: string
      mode: string
      input: UpdateGatewayInput
    }) =>
      apiFetch<GatewayCredentialDto>(`${BASE}/gateways/${gateway}/${mode}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ecommerceKeys.gateways }),
  })
}

// ── Marketing ──────────────────────────────────────────────────────────────

/**
 * Marketing amounts are rendered, never re-priced, so the server sends the
 * integer and the string it already formatted — no currency code, because
 * nothing on this side is allowed to format one itself.
 */
export interface MarketingMoney {
  amount: number
  formatted: string
}

export type DiscountType = 'percent' | 'fixed' | 'free_shipping'

export interface DiscountDto {
  id: string
  code: string
  name: string | null
  description: string | null
  type: DiscountType
  /** Percentage for `percent`, integer minor units for `fixed`. */
  value: number
  minSubtotalAmount: number | null
  maxDiscountAmount: number | null
  startsAt: string | null
  endsAt: string | null
  usageLimit: number | null
  usageLimitPerCustomer: number | null
  usageCount: number
  enabled: boolean
  /** Whether it would be honoured right now, all conditions considered. */
  live: boolean
}

export interface AffiliateDto {
  id: string
  code: string
  name: string
  email: string
  commissionPercent: number
  status: 'active' | 'paused' | 'blocked'
  payoutDetailsMasked: string | null
  hasPayoutDetails: boolean
  notes: string | null
  clicksCount: number
  ordersCount: number
  totalCommission: MarketingMoney
  paidCommission: MarketingMoney
  outstanding: MarketingMoney
  createdAt: string
}

export interface CommissionDto {
  id: string
  affiliateId: string
  affiliateName: string
  orderId: string
  orderNumber: string
  amount: MarketingMoney
  status: 'pending' | 'approved' | 'paid' | 'void'
  ratePercent: number
  approvedAt: string | null
  paidAt: string | null
  voidReason: string | null
  createdAt: string
}

export function useDiscounts() {
  return useQuery({
    queryKey: ['ecommerce', 'discounts'] as const,
    queryFn: () => apiFetch<DiscountDto[]>(`${BASE}/discounts`),
  })
}

export function useSaveDiscount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Partial<DiscountDto> }) =>
      id
        ? apiFetch<DiscountDto>(`${BASE}/discounts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
          })
        : apiFetch<DiscountDto>(`${BASE}/discounts`, {
            method: 'POST',
            body: JSON.stringify(input),
          }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'discounts'] }),
  })
}

export function useDeleteDiscount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${BASE}/discounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'discounts'] }),
  })
}

export function useAffiliates() {
  return useQuery({
    queryKey: ['ecommerce', 'affiliates'] as const,
    queryFn: () => apiFetch<AffiliateDto[]>(`${BASE}/affiliates`),
  })
}

export function useSaveAffiliate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: Record<string, unknown> }) =>
      id
        ? apiFetch<AffiliateDto>(`${BASE}/affiliates/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
          })
        : apiFetch<AffiliateDto>(`${BASE}/affiliates`, {
            method: 'POST',
            body: JSON.stringify(input),
          }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'affiliates'] }),
  })
}

export function useCommissions(status?: string) {
  const path = status ? `${BASE}/commissions?status=${status}` : `${BASE}/commissions`
  return useQuery({
    queryKey: ['ecommerce', 'commissions', status ?? 'all'] as const,
    queryFn: () => apiFetch<CommissionDto[]>(path),
  })
}

export function usePayCommissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commissionIds: string[]) =>
      apiFetch<{ paid: number }>(`${BASE}/commissions/pay`, {
        method: 'POST',
        body: JSON.stringify({ commissionIds }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ecommerce', 'commissions'] })
      void qc.invalidateQueries({ queryKey: ['ecommerce', 'affiliates'] })
    },
  })
}

export function useVerifyGateway() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ gateway, mode }: { gateway: string; mode: string }) =>
      apiFetch<{ ok: boolean; message?: string }>(`${BASE}/gateways/${gateway}/${mode}/verify`, {
        method: 'POST',
      }),
    // The attempt stamps lastVerifiedAt either way.
    onSettled: () => void qc.invalidateQueries({ queryKey: ecommerceKeys.gateways }),
  })
}

// ── Digital assets ─────────────────────────────────────────────────────────

export interface DigitalAssetDto {
  id: string
  variantId: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  /** `0` means unlimited. */
  maxDownloads: number
  /** `0` means the link never expires. */
  linkTtlHours: number
  createdAt: string
}

export interface DownloadGrantDto {
  id: string
  filename: string
  sizeBytes: number | null
  downloadsCount: number
  maxDownloads: number
  expiresAt: string | null
  live: boolean
}

export function useProductAssets(productId: string | null) {
  return useQuery({
    queryKey: ['ecommerce', 'assets', productId ?? 'none'] as const,
    queryFn: () => apiFetch<DigitalAssetDto[]>(`${BASE}/products/${productId}/assets`),
    enabled: Boolean(productId),
  })
}

export function useUploadAsset(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      variantId,
      file,
      maxDownloads,
      linkTtlHours,
    }: {
      variantId: string
      file: File
      maxDownloads: number
      linkTtlHours: number
    }) => {
      const body = new FormData()
      body.append('file', file)
      body.append('maxDownloads', String(maxDownloads))
      body.append('linkTtlHours', String(linkTtlHours))
      /**
       * `apiFetch` is bypassed on purpose: it sets a JSON content type, and a
       * multipart body needs the browser to pick its own boundary. The CSRF
       * token is read from the same `XSRF-TOKEN` cookie the shared client uses,
       * so this request is protected exactly like every other write.
       */
      const csrf = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
      const res = await fetch(`${BASE}/variants/${variantId}/assets`, {
        method: 'POST',
        body,
        credentials: 'same-origin',
        headers: csrf ? { 'X-XSRF-TOKEN': decodeURIComponent(csrf[1]!) } : {},
      })
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}))
        throw new Error(problem.message ?? 'That file could not be uploaded.')
      }
      return (await res.json()) as DigitalAssetDto
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'assets', productId] }),
  })
}

export function useUpdateAsset(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DigitalAssetDto> }) =>
      apiFetch<DigitalAssetDto>(`${BASE}/assets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'assets', productId] }),
  })
}

export function useDeleteAsset(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`${BASE}/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'assets', productId] }),
  })
}

export function useOrderGrants(orderId: string | null) {
  return useQuery({
    queryKey: ['ecommerce', 'grants', orderId ?? 'none'] as const,
    queryFn: () => apiFetch<DownloadGrantDto[]>(`${BASE}/orders/${orderId}/grants`),
    enabled: Boolean(orderId),
  })
}

export function useRevokeGrant(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ revoked: boolean }>(`${BASE}/grants/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'grants', orderId] }),
  })
}

// ── Manual orders ──────────────────────────────────────────────────────────

export interface ManualOrderInput {
  lines: { variantId: string; quantity: number }[]
  email: string
  shippingAddress?: Record<string, string | null>
  customerNote?: string | null
  internalNote?: string | null
  shippingAmount?: number
  discountAmount?: number
  markPaid?: boolean
  paymentReference?: string | null
}

export interface ManualOrderResult {
  orderId: string
  orderNumber: string
  /** Returned exactly once. The link to send the buyer. */
  accessToken: string
  total: { amount: number; currency: string }
  paid: boolean
}

export function useCreateManualOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ManualOrderInput) =>
      apiFetch<ManualOrderResult>(`${BASE}/orders`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ecommerce'] })
    },
  })
}

// ── Customers ──────────────────────────────────────────────────────────────

export interface CustomerDto {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  status: 'active' | 'blocked'
  emailVerified: boolean
  acceptsMarketing: boolean
  ordersCount: number
  totalSpent: MoneyDto
  /** No password — created by a guest checkout and cannot sign in. */
  isGuest: boolean
  createdAt: string | null
}

export interface CustomerListResult {
  items: CustomerDto[]
  total: number
  page: number
  pageSize: number
}

export function useCustomers(query: {
  page?: number
  pageSize?: number
  search?: string
  status?: 'active' | 'blocked' | 'all'
}) {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.status && query.status !== 'all') params.set('status', query.status)
  const qs = params.toString()
  const path = qs ? `${BASE}/customers?${qs}` : `${BASE}/customers`

  return useQuery({
    queryKey: ['ecommerce', 'customers', path] as const,
    queryFn: () => apiFetch<CustomerListResult>(path),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  })
}

export function useSetCustomerStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'blocked' }) =>
      apiFetch<CustomerDto>(`${BASE}/customers/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'customers'] }),
  })
}

export interface CreateCustomerInput {
  email: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  /** Blank/omitted = a record-only customer (no sign-in); a value lets them sign in. */
  password?: string
  acceptsMarketing?: boolean
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      apiFetch<CustomerDto>(`${BASE}/customers`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'customers'] }),
  })
}

// ── Analytics ──────────────────────────────────────────────────────────────

export interface SalesPoint {
  /** `YYYY-MM-DD`, one entry per day including the empty ones. */
  date: string
  /** Minor units — a chart needs a number to plot, not a formatted string. */
  revenue: number
  orders: number
}

export interface TopProductDto {
  productId: string | null
  title: string
  quantity: number
  revenue: MoneyDto
}

export interface SalesReportDto {
  currency: string
  days: number
  /** Every currency with sales in the window — reports are one at a time. */
  currenciesWithSales: string[]
  series: SalesPoint[]
  topProducts: TopProductDto[]
  windowRevenue: MoneyDto
  windowOrders: number
}

export interface AbandonedCartDto {
  id: string
  email: string | null
  itemCount: number
  value: MoneyDto
  updatedAt: string
  reachable: boolean
}

export function useSalesReport(days: number, currency?: string) {
  const path = currency
    ? `${BASE}/sales?days=${days}&currency=${currency}`
    : `${BASE}/sales?days=${days}`
  return useQuery({
    queryKey: ['ecommerce', 'sales', days, currency ?? 'base'] as const,
    queryFn: () => apiFetch<SalesReportDto>(path),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  })
}

export function useAbandonedCarts() {
  return useQuery({
    queryKey: ['ecommerce', 'abandoned-carts'] as const,
    queryFn: () => apiFetch<AbandonedCartDto[]>(`${BASE}/abandoned-carts`),
    staleTime: 60_000,
  })
}

// ── Currencies ─────────────────────────────────────────────────────────────

export interface StoreCurrencyDto {
  code: string
  /** Decimal places for this currency — JPY is 0, USD is 2. */
  exponent: number
  isBase: boolean
}

export interface VariantPriceDto {
  currency: string
  /** Integer minor units **in that currency's exponent**, never converted. */
  priceAmount: number
  compareAtAmount: number | null
}

export function useStoreCurrencies() {
  return useQuery({
    queryKey: ['ecommerce', 'currencies'] as const,
    queryFn: () => apiFetch<StoreCurrencyDto[]>(`${BASE}/currencies`),
    staleTime: 60_000,
  })
}

export function useUpdateStoreCurrencies() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (codes: string[]) =>
      apiFetch<StoreCurrencyDto[]>(`${BASE}/currencies`, {
        method: 'PUT',
        body: JSON.stringify({ codes }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce'] }),
  })
}

export function useVariantPrices(variantId: string | null) {
  return useQuery({
    queryKey: ['ecommerce', 'variant-prices', variantId ?? 'none'] as const,
    queryFn: () => apiFetch<VariantPriceDto[]>(`${BASE}/variants/${variantId}/prices`),
    enabled: Boolean(variantId),
  })
}

export function useSaveVariantPrices(variantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prices: VariantPriceDto[]) =>
      apiFetch<VariantPriceDto[]>(`${BASE}/variants/${variantId}/prices`, {
        method: 'PUT',
        body: JSON.stringify({ prices }),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['ecommerce', 'variant-prices', variantId] }),
  })
}

// ── Shipping ───────────────────────────────────────────────────────────────

export interface ShippingRateDto {
  currency: string
  /** Integer minor units in that currency. Never converted. */
  rateAmount: number
  /** Null disables free shipping — distinct from 0, which makes it always free. */
  freeAboveAmount: number | null
}

export interface ShippingMethodDto {
  id?: string
  name: string
  description: string | null
  /** In the store's base currency; other currencies live in `rates`. */
  rateAmount: number
  freeAboveAmount: number | null
  minDeliveryDays: number | null
  maxDeliveryDays: number | null
  enabled: boolean
  position?: number
  rates: ShippingRateDto[]
}

export interface ShippingZoneDto {
  id?: string
  name: string
  /** ISO country codes. Empty means the catch-all zone. */
  countries: string[]
  states: string[]
  enabled: boolean
  position?: number
  methods: ShippingMethodDto[]
}

export function useShipping() {
  return useQuery({
    queryKey: ['ecommerce', 'shipping'] as const,
    queryFn: () => apiFetch<ShippingZoneDto[]>(`${BASE}/shipping`),
  })
}

export function useSaveShipping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (zones: ShippingZoneDto[]) =>
      apiFetch<ShippingZoneDto[]>(`${BASE}/shipping`, {
        method: 'PUT',
        body: JSON.stringify({ zones }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce', 'shipping'] }),
  })
}

export function useMarkShipped(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (shipment: {
      carrier: string | null
      trackingNumber: string | null
      trackingUrl: string | null
    }) =>
      apiFetch<OrderDetailDto>(`${BASE}/orders/${orderId}/ship`, {
        method: 'POST',
        body: JSON.stringify(shipment),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ecommerceKeys.order(orderId) }),
  })
}

export function useSeedStorefront() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ shopPageId: string | null; productPageId: string | null; created: string[] }>(
        `${BASE}/storefront/seed`,
        { method: 'POST' }
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce'] }),
  })
}
