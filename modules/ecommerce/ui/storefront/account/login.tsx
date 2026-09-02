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
  // Set once the password step reports a 2FA account; swaps the form for the code step.
  const [pendingToken, setPendingToken] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await accountApi.login({ email: email.trim(), password })
      if ('needs2fa' in res) {
        setPendingToken(res.pendingToken)
        setSubmitting(false)
        return
      }
      window.location.href = '/shop/account'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.')
      setSubmitting(false)
    }
  }

  if (pendingToken) {
    return (
      <TwoFactorStep
        embedded={embedded}
        pendingToken={pendingToken}
        onCancel={() => {
          setPendingToken(null)
          setPassword('')
        }}
      />
    )
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

/** Second step of a 2FA sign-in: a single code field posting the pending token. */
function TwoFactorStep({
  embedded,
  pendingToken,
  onCancel,
}: {
  embedded?: boolean
  pendingToken: string
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await accountApi.verify2fa({ pendingToken, code: code.trim() })
      window.location.href = '/shop/account'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not match.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      {!embedded && <Head title="Two-factor authentication" />}
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LockIcon />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app, or a recovery code.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="totp" className="text-sm font-medium">
                Authentication code
              </label>
              <input
                id="totp"
                type="text"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="text"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
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

            <button type="submit" disabled={submitting || !code.trim()} className={SUBMIT_CLASS}>
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={onCancel}
            className="font-medium text-primary hover:underline"
          >
            Back to sign in
          </button>
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
