import { useState, type FormEvent } from 'react'
import { Head } from '@inertiajs/react'
import { accountApi } from '../_api'
import { StorefrontLayout, FIELD_CLASS, SUBMIT_CLASS } from '../_layout'

/**
 * Sign in.
 *
 * Deliberately thin. The server answers identically whether or not the email
 * exists and runs a scrypt hash on both paths, so there is nothing this form
 * can do to make the response distinguishable — and nothing it should try to,
 * such as checking the address first.
 */
/**
 * The shopper sign-in screen.
 *
 * Exported so the `LoginBlock` can render it on a builder page overriding
 * `/shop/account/login`. `embedded` drops the `<Head>` (the page owns SEO).
 */
export function LoginScreen({ embedded }: { embedded?: boolean } = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await accountApi.login({ email: email.trim(), password })
      window.location.href = '/shop/account'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      {!embedded && <Head title="Sign in" />}
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LockIcon />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to see your orders. You never needed an account to buy.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            {error ? (
              <p
                className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={submitting} className={SUBMIT_CLASS}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          No account?{' '}
          <a href="/shop/account/register" className="font-medium text-primary hover:underline">
            Create one
          </a>
        </p>
      </div>
    </div>
  )
}

function LockIcon() {
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
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/** The fixed `/shop/account/login` screen (default when no override is assigned). */
export default function AccountLoginPage() {
  return (
    <StorefrontLayout title="Sign in">
      <LoginScreen embedded />
    </StorefrontLayout>
  )
}
