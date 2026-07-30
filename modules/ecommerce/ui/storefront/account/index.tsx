import { useEffect, useState } from 'react'
import { Head } from '@inertiajs/react'
import { accountApi, shopApi, type AccountOrderDto, type CustomerDto } from '../_api'

/**
 * A buyer's order history.
 *
 * Signed-in only, and it says so rather than redirecting: a hard redirect from
 * a client-rendered page flashes the wrong content first.
 */
export default function AccountPage() {
  const [customer, setCustomer] = useState<CustomerDto | null>(null)
  const [orders, setOrders] = useState<AccountOrderDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    shopApi
      .me()
      .then(async ({ customer: me }) => {
        if (!alive) return
        setCustomer(me)
        if (!me) return

        const { orders: list } = await accountApi.orders()
        if (alive) setOrders(list)
      })
      .catch(() => {
        // Signed out, or the session expired. The empty state covers both.
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Head title="Your account" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <Head title="Your account" />
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          To see your orders. Every order also has its own link in your confirmation email — you
          do not need an account to use it.
        </p>
        <a
          href="/shop/account/login"
          className="mt-6 inline-block rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Head title="Your account" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.fullName || customer.email}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{customer.email}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await accountApi.logout().catch(() => {})
            window.location.href = '/'
          }}
          className="shrink-0 text-sm text-muted-foreground underline hover:text-foreground"
        >
          Sign out
        </button>
      </div>

      <h2 className="mt-10 text-sm font-medium">Your orders</h2>

      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing here yet. Orders placed as a guest with this email are not linked automatically —
          use the link in the confirmation email for those.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {orders.map((order) => (
            <li key={order.number} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium">{order.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.placedAt).toLocaleDateString()} · {order.itemCount}{' '}
                    {order.itemCount === 1 ? 'item' : 'items'} · {order.status}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{order.total.formatted}</span>
              </div>

              <ul className="mt-3 space-y-1.5">
                {order.items.map((item, index) => (
                  <li key={index} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                      {item.variantTitle ? ` · ${item.variantTitle}` : ''}
                    </span>
                    <span className="shrink-0">× {item.quantity}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
