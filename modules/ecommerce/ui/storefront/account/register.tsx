import { useState, type FormEvent } from 'react'
import { Head } from '@inertiajs/react'
import { accountApi } from '../_api'
import { StorefrontLayout, FIELD_CLASS, SUBMIT_CLASS } from '../_layout'

/**
 * Create an account.
 *
 * Marketing consent is an **unticked** box, and the wording says what it is
 * for. A pre-ticked one is not consent, and this is the only place the shop
 * gets to ask.
 */
/**
 * The shopper sign-up screen.
 *
 * Exported so the `RegisterBlock` can render it on a builder page overriding
 * `/shop/account/register`. `embedded` drops the `<Head>` (the page owns SEO).
 */
export function RegisterScreen({ embedded }: { embedded?: boolean } = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [acceptsMarketing, setAcceptsMarketing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await accountApi.register({
        email: email.trim(),
        password,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        acceptsMarketing,
      })
      window.location.href = '/shop/account'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      {!embedded && <Head title="Create an account" />}
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlusIcon />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Keeps your order history in one place. Buying works without one.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="text-sm font-medium">
                  First name
                </label>
                <input
                  id="firstName"
                  value={firstName}
                  autoComplete="given-name"
                  onChange={(e) => setFirstName(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="text-sm font-medium">
                  Last name
                </label>
                <input
                  id="lastName"
                  value={lastName}
                  autoComplete="family-name"
                  onChange={(e) => setLastName(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

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
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={acceptsMarketing}
                onChange={(e) => setAcceptsMarketing(e.target.checked)}
              />
              <span className="text-muted-foreground">
                Email me about offers and things I left in my basket. You can stop this at any time.
              </span>
            </label>

            {error ? (
              <p
                className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={submitting} className={SUBMIT_CLASS}>
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have one?{' '}
          <a href="/shop/account/login" className="font-medium text-primary hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}

function UserPlusIcon() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}

/** The fixed `/shop/account/register` screen (default when no override is assigned). */
export default function AccountRegisterPage() {
  return (
    <StorefrontLayout title="Create an account">
      <RegisterScreen embedded />
    </StorefrontLayout>
  )
}
