import { useEffect, useState } from 'react'
import { accountApi, type OrderDetailDto } from '../_api'
import { OrderStatusPill, PaymentStatusPill } from './order-status'
import { formatBytes, formatDate } from './_format'

export function OrderDetailSection({ number, onBack }: { number: string; onBack: () => void }) {
  const [order, setOrder] = useState<OrderDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setOrder(null)
    setError(null)
    accountApi
      .orderDetail(number)
      .then((data) => alive && setOrder(data))
      .catch(() => alive && setError('We could not open that order.'))
    return () => {
      alive = false
    }
  }, [number])

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
          aria-hidden
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to orders
      </button>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : !order ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-mono text-lg font-semibold">{order.number}</h2>
              <p className="text-sm text-muted-foreground">Placed {formatDate(order.placedAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <OrderStatusPill status={order.status} />
              <PaymentStatusPill status={order.paymentStatus} />
            </div>
          </div>

          {order.trackingNumber || order.shippedAt ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-medium">Shipment</p>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {order.shippedAt ? <p>Shipped {formatDate(order.shippedAt)}</p> : null}
                {order.carrier ? <p>Carrier: {order.carrier}</p> : null}
                {order.trackingNumber ? (
                  <p>
                    Tracking: <span className="font-mono">{order.trackingNumber}</span>
                  </p>
                ) : null}
              </div>
              {order.trackingUrl ? (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-accent/40"
                >
                  Track your parcel
                </a>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <ul className="divide-y divide-border">
              {order.items.map((item, i) => (
                <li key={i} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.variantTitle ? (
                      <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {item.unit.formatted} × {item.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{item.total.formatted}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <Row label="Subtotal" value={order.subtotal.formatted} />
              {order.discount ? (
                <Row label="Discount" value={`− ${order.discount.formatted}`} />
              ) : null}
              {order.shipping.amount > 0 ? (
                <Row label="Shipping" value={order.shipping.formatted} />
              ) : null}
              {order.tax.amount > 0 ? <Row label="Tax" value={order.tax.formatted} /> : null}
              <Row label="Total" value={order.total.formatted} bold />
            </dl>
          </div>

          {order.shippingAddress ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-medium">Delivery address</p>
              <address className="mt-2 text-sm not-italic text-muted-foreground">
                {[order.shippingAddress.firstName, order.shippingAddress.lastName]
                  .filter(Boolean)
                  .join(' ')}
                <br />
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? (
                  <>
                    <br />
                    {order.shippingAddress.line2}
                  </>
                ) : null}
                <br />
                {[
                  order.shippingAddress.city,
                  order.shippingAddress.state,
                  order.shippingAddress.postalCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
                <br />
                {order.shippingAddress.country}
              </address>
            </div>
          ) : null}

          {order.downloads.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-medium">Downloads</p>
              <ul className="mt-3 space-y-2">
                {order.downloads.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.filename}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(d.sizeBytes)}</p>
                    </div>
                    {d.live && d.url ? (
                      <a
                        href={d.url}
                        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">Expired</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`tabular-nums ${bold ? 'font-medium' : ''}`}>{value}</dd>
    </div>
  )
}
