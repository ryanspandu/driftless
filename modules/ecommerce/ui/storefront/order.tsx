import { useEffect, useRef, useState } from 'react'
import { Head } from '@inertiajs/react'
import { shopApi, type OrderStatusDto } from './_api'

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return 'File'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

/**
 * The page a buyer lands on after paying.
 *
 * Two things it deliberately does **not** do:
 *
 * - It never marks anything paid. It reads the order by its access token, and
 *   the server confirms with the gateway using a payment id from its own row.
 *   Nothing in this URL decides whether money was taken.
 * - It never shows an error when payment is merely unconfirmed. A buyer often
 *   arrives before the webhook lands, so the page says "confirming" and polls
 *   briefly rather than implying something went wrong.
 */
export default function OrderPage() {
  const [order, setOrder] = useState<OrderStatusDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const attempts = useRef(0)

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setError('This link is missing its order reference.')
      return
    }

    let alive = true
    let timer: number | undefined

    const poll = () => {
      shopApi
        .orderStatus(token)
        .then((data) => {
          if (!alive) return
          setOrder(data)

          /**
           * Keep checking for a short while if it is not paid yet. Gateways
           * usually deliver their webhook within seconds, and the server also
           * pulls status directly — so a handful of attempts is plenty, and an
           * unbounded poll would hammer an endpoint that is public.
           */
          if (!data.paid && attempts.current < 5) {
            attempts.current += 1
            timer = window.setTimeout(poll, 2_000)
          }
        })
        .catch(() => {
          if (alive) setError('We could not find that order.')
        })
    }

    poll()

    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Head title="Order" />
        <h1 className="text-2xl font-semibold tracking-tight">Order not found</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <a href="/" className="mt-6 inline-block text-sm underline">
          Back to the shop
        </a>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Head title="Order" />
        <p className="text-sm text-muted-foreground">Loading your order…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Head title={`Order ${order.number}`} />

      <div className="text-center">
        {order.paid ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Thank you</h1>
            <p className="mt-2 text-muted-foreground">
              Order {order.number} is confirmed. A receipt is on its way to {order.email}.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Confirming your payment</h1>
            <p className="mt-2 text-muted-foreground">
              Order {order.number} is placed. Payment is still being confirmed — this page will
              update, and you will get an email either way.
            </p>
          </>
        )}
      </div>

      <div className="mt-10 rounded-xl border border-border p-5">
        <ul className="space-y-4">
          {order.items.map((item, index) => (
            <li key={index} className="flex gap-3 text-sm">
              <div className="size-14 shrink-0 overflow-hidden rounded bg-muted">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p>{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.variantTitle ? `${item.variantTitle} · ` : ''}
                  {item.quantity} ×
                </p>
              </div>
              <span className="tabular-nums">{item.total.formatted}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{order.subtotal.formatted}</span>
          </div>
          {order.shipping.amount > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="tabular-nums">{order.shipping.formatted}</span>
            </div>
          ) : null}
          {order.tax.amount > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{order.tax.formatted}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span className="tabular-nums">{order.total.formatted}</span>
          </div>
        </div>
      </div>

      {order.shippedAt ? (
        <div className="mt-6 rounded-xl border border-border p-5">
          <h2 className="text-sm font-medium">On its way</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Shipped {new Date(order.shippedAt).toLocaleDateString()}
            {order.carrier ? ` with ${order.carrier}` : ''}
          </p>
          {order.trackingNumber ? (
            <p className="mt-3 font-mono text-sm">{order.trackingNumber}</p>
          ) : null}
          {order.trackingUrl ? (
            <a
              href={order.trackingUrl}
              className="mt-3 inline-block rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40"
              rel="noreferrer nofollow"
              target="_blank"
            >
              Track your parcel
            </a>
          ) : null}
        </div>
      ) : null}

      {order.downloads.length > 0 ? (
        <div className="mt-6 rounded-xl border border-border p-5">
          <h2 className="text-sm font-medium">Your downloads</h2>
          <ul className="mt-3 space-y-3">
            {order.downloads.map((file) => (
              <li key={file.id} className="flex items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.sizeBytes)}
                    {file.maxDownloads > 0
                      ? ` · ${Math.max(file.maxDownloads - file.downloadsCount, 0)} of ${file.maxDownloads} downloads left`
                      : ''}
                    {file.expiresAt
                      ? ` · available until ${new Date(file.expiresAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                {file.url ? (
                  <a
                    href={file.url}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/40"
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

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Keep this link — it is how you check your order{order.downloads.length > 0 ? ' and reach your files' : ''} without
        an account.
      </p>
    </div>
  )
}
