import { useEffect, useState } from 'react'
import { Head } from '@inertiajs/react'
import { accountApi, shopApi, type AccountOrderDto, type CustomerDto } from '../_api'
import { StorefrontLayout } from '../_layout'
import { OverviewSection } from './overview'
import { OrdersSection } from './orders'
import { OrderDetailSection } from './order-detail'
import { ProfileSection } from './profile'
import { AddressesSection } from './addresses'

type Tab = 'overview' | 'orders' | 'profile' | 'addresses'
const TABS: Tab[] = ['overview', 'orders', 'profile', 'addresses']
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  orders: 'Orders',
  profile: 'Profile',
  addresses: 'Addresses',
}

function readNav(): { tab: Tab; order: string | null } {
  if (typeof window === 'undefined') return { tab: 'overview', order: null }
  const params = new URLSearchParams(window.location.search)
  const tab = (params.get('tab') ?? 'overview') as Tab
  return { tab: TABS.includes(tab) ? tab : 'overview', order: params.get('order') }
}

/**
 * The customer account portal.
 *
 * A tabbed "My Account": Overview, Orders (+ a detail view), Profile and saved
 * Addresses. The active section is kept in the `?tab=` (and `?order=`) query so
 * it is linkable and the back button works. Signed-in only — it says so rather
 * than redirecting, since a redirect from a client-rendered page flashes first.
 *
 * Exported so the `AccountBlock` can render it on a builder page overriding
 * `/shop/account`; `embedded` drops the `<Head>` (the page owns SEO).
 */
export function AccountScreen({ embedded }: { embedded?: boolean } = {}) {
  const [customer, setCustomer] = useState<CustomerDto | null>(null)
  const [orders, setOrders] = useState<AccountOrderDto[]>([])
  const [loading, setLoading] = useState(true)
  const [nav, setNav] = useState(readNav)

  const loadCustomer = async () => {
    const { customer: me } = await shopApi.me()
    setCustomer(me)
    return me
  }

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
        // Signed out, or the session expired. The signed-out card covers both.
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onPop = () => setNav(readNav())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (tab: Tab, order?: string | null) => {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', tab)
    if (order) params.set('order', order)
    else params.delete('order')
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`)
    setNav({ tab, order: order ?? null })
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  const signOut = async () => {
    await accountApi.logout().catch(() => {})
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
        {!embedded && <Head title="Your account" />}
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        {!embedded && <Head title="Your account" />}
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserIcon />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            To see your orders and manage your details. Every order also has its own link in your
            confirmation email — you do not need an account to use it.
          </p>
          <a
            href="/shop/account/login"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Sign in
          </a>
        </div>
      </div>
    )
  }

  const activeDetail = nav.tab === 'orders' && nav.order
  const initial = (customer.fullName || customer.email || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      {!embedded && <Head title="Your account" />}

      <div className="mb-8 flex items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
          {initial}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {customer.firstName ? `Hi, ${customer.firstName}` : 'Your account'}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{customer.email}</p>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="md:sticky md:top-24 md:self-start">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {TABS.map((tab) => {
              const active = nav.tab === tab
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => navigate(tab)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                  }`}
                >
                  <TabIcon tab={tab} />
                  {TAB_LABEL[tab]}
                </button>
              )
            })}
            <button
              type="button"
              onClick={signOut}
              className="mt-1 flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground md:mt-4 md:border-t md:border-border md:pt-4"
            >
              <SignOutIcon />
              Sign out
            </button>
          </nav>
        </aside>

        <div className="min-w-0">
          {activeDetail ? (
            <OrderDetailSection number={nav.order!} onBack={() => navigate('orders')} />
          ) : nav.tab === 'overview' ? (
            <OverviewSection
              customer={customer}
              orders={orders}
              onOpenOrder={(number) => navigate('orders', number)}
              onGoTo={(tab) => navigate(tab)}
            />
          ) : nav.tab === 'orders' ? (
            <OrdersSection orders={orders} onOpenOrder={(number) => navigate('orders', number)} />
          ) : nav.tab === 'profile' ? (
            <ProfileSection customer={customer} onUpdated={loadCustomer} />
          ) : (
            <AddressesSection />
          )}
        </div>
      </div>
    </div>
  )
}

function TabIcon({ tab }: { tab: Tab }) {
  const body: Record<Tab, React.ReactNode> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </>
    ),
    orders: (
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
        <path d="M14 2v5h5" />
        <path d="M9 13h6M9 17h6" />
      </>
    ),
    profile: (
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    addresses: (
      <>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden
    >
      {body[tab]}
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

/** The fixed `/shop/account` screen (default when no override page is assigned). */
export default function AccountPage() {
  return (
    <StorefrontLayout title="Your account">
      <AccountScreen embedded />
    </StorefrontLayout>
  )
}
