import { useEffect, useState } from 'react'
import type { CodePageProps } from '~/custom/types'
import { PageShell } from '../components/page_shell'
import { shop, isStoreOff, type Account, type AccountOrder } from '../components/shop_api'

/**
 * A customer-account demo, decoupled via `/api/shop/*`: signed out shows login +
 * register; signed in shows the profile and order history. Storefront accounts
 * are a SEPARATE login from the admin users (own table + cookie). `GET /api/shop/me`
 * never 401s — it returns `{ account: null }` when signed out, so this page can
 * always ask "who's here?" without a redirect.
 */
export const path = 'kit-example/account-demo'
export const title = 'Customer account in a kit'

export default function AccountDemo({ header, footer }: CodePageProps) {
  const [account, setAccount] = useState<Account | null>(null)
  const [orders, setOrders] = useState<AccountOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [storeOff, setStoreOff] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [login, setLogin] = useState({ email: '', password: '' })
  const [register, setRegister] = useState({ email: '', password: '', firstName: '' })
  const [pending2fa, setPending2fa] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  function handle(err: unknown) {
    if (isStoreOff(err)) setStoreOff(true)
    else setError(err instanceof Error ? err.message : 'Something went wrong.')
  }

  async function refresh() {
    try {
      const { account: me } = await shop.me()
      setAccount(me)
      setPending2fa(null)
      if (me) {
        const { orders: list } = await shop.getOrders()
        setOrders(list)
      } else {
        setOrders([])
      }
    } catch (err) {
      handle(err)
    }
  }

  useEffect(() => {
    let alive = true
    shop
      .me()
      .then(async ({ account: me }) => {
        if (!alive) return
        setAccount(me)
        setLoading(false)
        if (me) {
          const { orders: list } = await shop.getOrders()
          if (alive) setOrders(list)
        }
      })
      .catch((err) => {
        if (!alive) return
        setLoading(false)
        handle(err)
      })
    return () => {
      alive = false
    }
  }, [])

  async function doLogin(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await shop.login(login)
      if (result.needs2fa && result.pendingToken) setPending2fa(result.pendingToken)
      else await refresh()
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  async function doVerify2fa(event: React.FormEvent) {
    event.preventDefault()
    if (!pending2fa) return
    setBusy(true)
    setError(null)
    try {
      await shop.verify2fa({ pendingToken: pending2fa, code })
      await refresh()
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  async function doRegister(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Register starts a session server-side, so re-ask who's here.
      await shop.register(register)
      await refresh()
    } catch (err) {
      handle(err)
    } finally {
      setBusy(false)
    }
  }

  async function doLogout() {
    setError(null)
    try {
      await shop.logout()
      setAccount(null)
      setOrders([])
    } catch (err) {
      handle(err)
    }
  }

  const body = (() => {
    if (storeOff) {
      return (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          The store is turned off. Enable the e-commerce module under Settings → Modules.
        </p>
      )
    }
    if (loading) return <p className="text-sm text-muted-foreground">Checking your session…</p>

    if (account) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold">{account.fullName || account.email}</p>
              <p className="text-sm text-muted-foreground">{account.email}</p>
            </div>
            <button onClick={doLogout} className="text-sm text-primary hover:underline">
              Sign out
            </button>
          </div>
          <h2 className="text-base font-semibold">Your orders</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {orders.map((order) => (
                <li key={order.number} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium">#{order.number}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.status} · {order.itemCount} item(s)
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">{order.total.formatted}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    }

    if (pending2fa) {
      return (
        <form onSubmit={doVerify2fa} className="max-w-sm space-y-4">
          <h2 className="text-base font-semibold">Enter your 2FA code</h2>
          <Field label="Authentication code" value={code} onChange={setCode} required />
          <SubmitButton busy={busy}>Verify</SubmitButton>
        </form>
      )
    }

    return (
      <div className="grid gap-8 sm:grid-cols-2">
        <form onSubmit={doLogin} className="space-y-4">
          <h2 className="text-base font-semibold">Sign in</h2>
          <Field
            label="Email"
            type="email"
            value={login.email}
            onChange={(v) => setLogin((f) => ({ ...f, email: v }))}
            required
          />
          <Field
            label="Password"
            type="password"
            value={login.password}
            onChange={(v) => setLogin((f) => ({ ...f, password: v }))}
            required
          />
          <SubmitButton busy={busy}>Sign in</SubmitButton>
        </form>
        <form onSubmit={doRegister} className="space-y-4">
          <h2 className="text-base font-semibold">Create an account</h2>
          <Field
            label="First name"
            value={register.firstName}
            onChange={(v) => setRegister((f) => ({ ...f, firstName: v }))}
          />
          <Field
            label="Email"
            type="email"
            value={register.email}
            onChange={(v) => setRegister((f) => ({ ...f, email: v }))}
            required
          />
          <Field
            label="Password (min 8)"
            type="password"
            value={register.password}
            onChange={(v) => setRegister((f) => ({ ...f, password: v }))}
            required
          />
          <SubmitButton busy={busy}>Create account</SubmitButton>
        </form>
      </div>
    )
  })()

  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Customer accounts"
      title="Sign in, built in a kit"
      intro="A storefront account — separate from your admin login — driven entirely by /api/shop/* through the kit-local client. GET /api/shop/me never 401s, so the page always knows whether someone is signed in."
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {body}
    </PageShell>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
    </label>
  )
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
    >
      {busy ? 'Working…' : children}
    </button>
  )
}
