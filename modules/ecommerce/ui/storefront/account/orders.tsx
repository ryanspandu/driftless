import { type AccountOrderDto } from '../_api'
import { OrderStatusPill } from './order-status'
import { formatDate } from './_format'

/** A single tappable order row — shared by the Orders list and the Overview. */
export function OrderCard({ order, onOpen }: { order: AccountOrderDto; onOpen: () => void }) {
  const thumbs = order.items.filter((i) => i.imageUrl).slice(0, 4)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-ring"
    >
      <div className="flex shrink-0 -space-x-2">
        {thumbs.length > 0 ? (
          thumbs.map((item, i) => (
            <img
              key={i}
              src={item.imageUrl!}
              alt=""
              className="size-11 rounded-lg border-2 border-card bg-muted object-cover"
            />
          ))
        ) : (
          <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <BagIcon />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{order.number}</span>
          <OrderStatusPill status={order.status} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDate(order.placedAt)} · {order.itemCount}{' '}
          {order.itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>

      <span className="shrink-0 tabular-nums font-medium">{order.total.formatted}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}

export function OrdersSection({
  orders,
  onOpenOrder,
}: {
  orders: AccountOrderDto[]
  onOpenOrder: (number: string) => void
}) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm font-medium">No orders yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Orders placed as a guest with this email are not linked automatically — use the link in
          the confirmation email for those.
        </p>
        <a
          href="/shop"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Browse the shop
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <OrderCard key={order.number} order={order} onOpen={() => onOpenOrder(order.number)} />
      ))}
    </div>
  )
}

function BagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M5 8h14l-1.2 10.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  )
}
