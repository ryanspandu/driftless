/**
 * Storefront status pills.
 *
 * The admin has `PaymentBadge`/`FulfilmentBadge`, but they are tied to the admin
 * `Badge` component and its variants. The storefront is light-only and needs its
 * own small, self-contained map — one badge for where the order is in its life,
 * one for the money.
 */

type Tone = 'success' | 'warning' | 'info' | 'danger' | 'neutral'

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-blue-50 text-blue-700',
  danger: 'bg-red-50 text-red-700',
  neutral: 'bg-muted text-muted-foreground',
}

const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  fulfilled: { label: 'Shipped', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  unpaid: { label: 'Unpaid', tone: 'warning' },
  authorized: { label: 'Authorized', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  partially_refunded: { label: 'Partly refunded', tone: 'warning' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  failed: { label: 'Payment failed', tone: 'danger' },
}

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  )
}

export function OrderStatusPill({ status }: { status: string }) {
  const s = ORDER_STATUS[status] ?? { label: status, tone: 'neutral' as Tone }
  return <StatusPill label={s.label} tone={s.tone} />
}

export function PaymentStatusPill({ status }: { status: string }) {
  const s = PAYMENT_STATUS[status] ?? { label: status, tone: 'neutral' as Tone }
  return <StatusPill label={s.label} tone={s.tone} />
}
