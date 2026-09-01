import { type AccountOrderDto, type CustomerDto } from '../_api'
import { OrderCard } from './orders'
import { formatMonth } from './_format'

type Tab = 'overview' | 'orders' | 'profile' | 'addresses'

export function OverviewSection({
  customer,
  orders,
  onOpenOrder,
  onGoTo,
}: {
  customer: CustomerDto
  orders: AccountOrderDto[]
  onOpenOrder: (number: string) => void
  onGoTo: (tab: Tab) => void
}) {
  const recent = orders.slice(0, 3)

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Orders" value={String(customer.ordersCount)} />
        <Stat label="Total spent" value={customer.totalSpent?.formatted ?? '—'} />
        <Stat label="Member since" value={formatMonth(customer.memberSince)} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">Recent orders</h2>
          {orders.length > recent.length ? (
            <button
              type="button"
              onClick={() => onGoTo('orders')}
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </button>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <p className="text-sm font-medium">No orders yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              When you place an order it shows up here.
            </p>
            <a
              href="/shop"
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Browse the shop
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {recent.map((order) => (
              <OrderCard
                key={order.number}
                order={order}
                onOpen={() => onOpenOrder(order.number)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <QuickLink
          title="Your details"
          subtitle="Name, phone and password"
          onClick={() => onGoTo('profile')}
        />
        <QuickLink
          title="Addresses"
          subtitle="Save where your orders go"
          onClick={() => onGoTo('addresses')}
        />
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  )
}

function QuickLink({
  title,
  subtitle,
  onClick,
}: {
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-ring"
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
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
