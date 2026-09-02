import { useContext, useState, type FormEvent, type ReactNode } from 'react'
import { Link, router, usePage } from '@inertiajs/react'
import { Eye, EyeOff } from 'lucide-react'
import type { AuthPublicConfig } from '~/types/api'
import { CaptchaWidget } from '~/components/auth/captcha-widget'
import { GoogleSignInButton } from '~/components/auth/google-sign-in-button'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'
import { BlockDataContext, useBinding } from './block-data'
import { Box } from './style-fields'

/**
 * Working auth forms as builder blocks.
 *
 * Defined as real components, like `blocks-interactive.tsx`, so React hooks are
 * valid regardless of how Puck invokes a block's `render`. Each spreads
 * `styleFields` and wraps `<Box>`, so it inherits the whole Element panel.
 *
 * These post to the same endpoints the built-in screens post to. Nothing about
 * the credential path changes because a form was drawn in the builder — the
 * throttles, the CAPTCHA check and the generic error messages all live on the
 * POST, which these blocks do not touch.
 */

type StyleBag = Record<string, unknown>

/** Matches `AUTH_CONFIG_KEY` in `app/services/core_block_resolvers.ts`. */
const AUTH_CONFIG_KEY = 'auth:config'

/** True inside the Puck editor canvas. */
function editingFlag(s: StyleBag): boolean {
  return !!(s.puck as { isEditing?: boolean } | undefined)?.isEditing
}

/** Puck stores booleans as the strings 'true'/'false' (radio fields). */
function flag(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === '') return fallback
  return String(value) === 'true'
}

/**
 * The public auth config: server-resolved when there is one, fetched otherwise.
 *
 * The same "context first, fetch fallback" shape `CollectionList` uses. The
 * server path keeps a rendered login page from popping its Google button in
 * after hydration; the fetch path is what makes the block look right inside the
 * builder canvas, where no server resolution happened.
 */
function useAuthConfig(): AuthPublicConfig | undefined {
  const preloaded = useContext(BlockDataContext)[AUTH_CONFIG_KEY] as AuthPublicConfig | undefined
  const query = useAuthPublicConfig()
  return preloaded ?? query.data
}

/**
 * The server flashes failures and redirects back rather than returning Inertia
 * validation errors, and `flash` is shared on every render — including the
 * `public/page_ssr` one a builder page uses. A page built in the builder has no
 * `AuthLayout` to toast it, so the block shows it inline.
 */
function useFlashError(): string | null {
  const props = usePage().props as { flash?: { error?: string } }
  return props.flash?.error ?? null
}

const fieldCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
const labelCls = 'mb-1 block text-sm font-medium'
const buttonCls =
  'w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60'
const linkCls = 'font-medium text-primary hover:underline'

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  )
}

function PasswordInput({
  id,
  name,
  autoComplete,
  value,
  onChange,
  minLength,
}: {
  id: string
  name: string
  autoComplete: string
  value: string
  onChange: (v: string) => void
  minLength?: number
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        className={`${fieldCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/** The dashed note a block shows in the editor when it would render nothing live. */
function EditorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export function LoginFormView({
  loginLabel,
  passwordLabel,
  submitLabel,
  showGoogle,
  showForgotLink,
  showSignupLink,
  ...s
}: {
  loginLabel?: string
  passwordLabel?: string
  submitLabel?: string
  showGoogle?: string
  showForgotLink?: string
  showSignupLink?: string
} & StyleBag) {
  const editing = editingFlag(s)
  const cfg = useAuthConfig()
  const flashError = useFlashError()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const needCaptcha =
    cfg?.captcha.enabled === true &&
    cfg.captcha.onLogin === true &&
    Boolean(cfg.captcha.siteKey) &&
    Boolean(cfg.captcha.provider)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // Inert in the canvas: signing the operator in from inside the editor would
    // navigate away from the page they are building.
    if (editing) return
    setError(null)
    if (needCaptcha && !captchaToken?.trim()) {
      setError('Complete the verification challenge before signing in.')
      return
    }
    setLoading(true)
    router.post(
      '/login',
      { login, password, ...(needCaptcha && captchaToken ? { captchaToken } : {}) },
      { onFinish: () => setLoading(false) }
    )
  }

  return (
    <Box s={s}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className={labelCls} htmlFor="auth-login">
            {loginLabel || 'Email or username'}
          </label>
          <input
            id="auth-login"
            name="login"
            type="text"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            className={fieldCls}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className={labelCls} htmlFor="auth-password">
              {passwordLabel || 'Password'}
            </label>
            {flag(showForgotLink) ? (
              <Link
                href="/forgot-password"
                className="mb-1 text-xs text-muted-foreground hover:underline"
              >
                Forgot password?
              </Link>
            ) : null}
          </div>
          <PasswordInput
            id="auth-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />
        </div>

        {needCaptcha && cfg?.captcha ? (
          <CaptchaWidget
            provider={cfg.captcha.provider!}
            siteKey={cfg.captcha.siteKey!}
            onToken={setCaptchaToken}
          />
        ) : null}

        <ErrorLine message={error ?? flashError} />

        <button type="submit" className={buttonCls} disabled={loading || editing}>
          {loading ? 'Signing in…' : submitLabel || 'Sign in'}
        </button>
      </form>

      {flag(showGoogle) && cfg?.google.enabled ? (
        <div className="mt-4 space-y-3">
          <p className="text-center text-xs text-muted-foreground">or</p>
          <GoogleSignInButton />
        </div>
      ) : null}

      {/* `/register` 404s when sign-up is closed, so only link to it when open. */}
      {flag(showSignupLink) && cfg?.registrationEnabled ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className={linkCls}>
            Sign up
          </Link>
        </p>
      ) : null}
    </Box>
  )
}

export function RegisterFormView({
  usernameLabel,
  emailLabel,
  passwordLabel,
  submitLabel,
  showNameFields,
  showLoginLink,
  ...s
}: {
  usernameLabel?: string
  emailLabel?: string
  passwordLabel?: string
  submitLabel?: string
  showNameFields?: string
  showLoginLink?: string
} & StyleBag) {
  const editing = editingFlag(s)
  const cfg = useAuthConfig()
  const flashError = useFlashError()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const needCaptcha =
    cfg?.captcha.enabled === true &&
    cfg.captcha.onRegister === true &&
    Boolean(cfg.captcha.siteKey) &&
    Boolean(cfg.captcha.provider)

  /**
   * Sign-up closed is not a styling problem — `/register` 404s in that state,
   * so a form here could only ever fail. Nothing renders live; the editor gets
   * an explanation rather than an inexplicably empty area.
   */
  if (cfg && !cfg.registrationEnabled) {
    if (!editing) return null
    return (
      <Box s={s}>
        <EditorNote>
          Public sign-up is turned off, so this form renders nothing on the live site. Turn it on in
          Settings → Application.
        </EditorNote>
      </Box>
    )
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (editing) return
    setError(null)
    if (needCaptcha && !captchaToken?.trim()) {
      setError('Complete the verification challenge before signing up.')
      return
    }
    setLoading(true)
    router.post(
      '/register',
      {
        email,
        username,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        ...(needCaptcha && captchaToken ? { captchaToken } : {}),
      },
      { onFinish: () => setLoading(false) }
    )
  }

  return (
    <Box s={s}>
      <form className="space-y-4" onSubmit={onSubmit}>
        {flag(showNameFields) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="auth-first-name">
                First name
              </label>
              <input
                id="auth-first-name"
                name="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="auth-last-name">
                Last name
              </label>
              <input
                id="auth-last-name"
                name="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={fieldCls}
              />
            </div>
          </div>
        ) : null}

        <div>
          <label className={labelCls} htmlFor="auth-username">
            {usernameLabel || 'Username'}
          </label>
          <input
            id="auth-username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={2}
            className={fieldCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="auth-email">
            {emailLabel || 'Email'}
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={fieldCls}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="auth-new-password">
            {passwordLabel || 'Password'}
          </label>
          <PasswordInput
            id="auth-new-password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            minLength={8}
          />
        </div>

        {needCaptcha && cfg?.captcha ? (
          <CaptchaWidget
            provider={cfg.captcha.provider!}
            siteKey={cfg.captcha.siteKey!}
            onToken={setCaptchaToken}
          />
        ) : null}

        <ErrorLine message={error ?? flashError} />

        <button type="submit" className={buttonCls} disabled={loading || editing}>
          {loading ? 'Creating…' : submitLabel || 'Sign up'}
        </button>
      </form>

      {flag(showLoginLink) ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className={linkCls}>
            Sign in
          </Link>
        </p>
      ) : null}
    </Box>
  )
}

export function ForgotPasswordFormView({
  emailLabel,
  submitLabel,
  showLoginLink,
  ...s
}: {
  emailLabel?: string
  submitLabel?: string
  showLoginLink?: string
} & StyleBag) {
  const editing = editingFlag(s)
  const flashError = useFlashError()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (editing) return
    setLoading(true)
    // The server always redirects to /login with the same generic flash, so
    // there is no success state to render here — and no way for this block to
    // reveal whether the address was registered.
    router.post('/forgot-password', { email }, { onFinish: () => setLoading(false) })
  }

  return (
    <Box s={s}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className={labelCls} htmlFor="auth-forgot-email">
            {emailLabel || 'Email'}
          </label>
          <input
            id="auth-forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={fieldCls}
          />
        </div>

        <ErrorLine message={flashError} />

        <button type="submit" className={buttonCls} disabled={loading || editing}>
          {loading ? 'Sending…' : submitLabel || 'Send reset link'}
        </button>
      </form>

      {flag(showLoginLink) ? (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link href="/login" className={linkCls}>
            Sign in
          </Link>
        </p>
      ) : null}
    </Box>
  )
}

export function ResetPasswordFormView({
  passwordLabel,
  confirmLabel,
  submitLabel,
  expiredMessage,
  ...s
}: {
  passwordLabel?: string
  confirmLabel?: string
  submitLabel?: string
  expiredMessage?: string
} & StyleBag) {
  const editing = editingFlag(s)
  const flashError = useFlashError()
  /**
   * The token and its validity arrive as route bindings, the same channel a
   * product page uses to tell its blocks which slug the URL named — so this
   * block needs no props threaded through the renderer.
   */
  const token = useBinding('token')
  const invalid = useBinding('invalid') === '1'
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (editing) return
    setError(null)
    if (password !== confirmation) {
      setError('Both passwords must match.')
      return
    }
    setLoading(true)
    router.post(
      '/reset-password',
      { token, password, passwordConfirmation: confirmation },
      { onFinish: () => setLoading(false) }
    )
  }

  if (invalid && !editing) {
    return (
      <Box s={s}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {expiredMessage ||
              'This reset link has expired or was already used. Reset links work once and last one hour.'}
          </p>
          <Link href="/forgot-password" className={`text-sm ${linkCls}`}>
            Request a new link
          </Link>
        </div>
      </Box>
    )
  }

  return (
    <Box s={s}>
      {editing ? (
        <div className="mb-4">
          <EditorNote>
            The reset token comes from the emailed link. On a real visit this form submits it; here
            it is empty.
          </EditorNote>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className={labelCls} htmlFor="auth-reset-password">
            {passwordLabel || 'New password'}
          </label>
          <PasswordInput
            id="auth-reset-password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            minLength={8}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="auth-reset-confirm">
            {confirmLabel || 'Confirm password'}
          </label>
          <input
            id="auth-reset-confirm"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            minLength={8}
            className={fieldCls}
          />
        </div>

        <ErrorLine message={error ?? flashError} />

        <button type="submit" className={buttonCls} disabled={loading || editing}>
          {loading ? 'Saving…' : submitLabel || 'Update password'}
        </button>
      </form>
    </Box>
  )
}

/**
 * Where each `FormBlock` handler posts, and what the server reads there.
 *
 * Exported so the field's help text and this map cannot drift: an editor who
 * names an input wrong gets a form that fails silently, so the documented names
 * have to come from the same place the code does.
 */
export const FORM_HANDLERS: Record<string, { action: string; fields: string[] }> = {
  login: { action: '/login', fields: ['login', 'password', 'captchaToken'] },
  register: {
    action: '/register',
    fields: ['email', 'username', 'password', 'firstName', 'lastName', 'captchaToken'],
  },
  forgotPassword: { action: '/forgot-password', fields: ['email'] },
  resetPassword: {
    action: '/reset-password',
    fields: ['token', 'password', 'passwordConfirmation'],
  },
}

/** Hidden field a bot fills in; a real visitor never sees it. Must match the server. */
const FORM_HONEYPOT_FIELD = '_hp_url'

function readXsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]!) : undefined
}

export function FormBlockView({
  content: Content,
  action,
  method,
  handler,
  formName,
  successMessage,
  ...s
}: {
  content?: React.ComponentType
  action?: string
  method?: string
  handler?: string
  formName?: string
  successMessage?: string
} & StyleBag) {
  const editing = editingFlag(s)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const target = handler && handler !== 'none' ? FORM_HANDLERS[handler] : undefined

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (editing || !target) return

    /**
     * Values come straight off the DOM form because the children are ordinary
     * `Input` blocks rendering real `<input name=…>` elements — there is no
     * shared React state to read, and requiring one would mean rewriting every
     * form primitive.
     */
    const data = Object.fromEntries(new FormData(e.currentTarget).entries())
    setLoading(true)
    router.post(target.action, data as Record<string, string>, {
      onFinish: () => setLoading(false),
    })
  }

  // Collect: post the raw fields to the submissions inbox via fetch (no page
  // navigation), then swap the form for a success message.
  function onCollect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (editing) return
    const form = e.currentTarget
    const fields = Object.fromEntries(new FormData(form).entries())
    setLoading(true)
    fetch('/api/forms/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(readXsrfCookie() ? { 'X-XSRF-TOKEN': readXsrfCookie()! } : {}),
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        form: formName || 'Form',
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        fields,
      }),
    })
      .then(() => {
        setDone(true)
        form.reset()
      })
      .catch(() => setDone(true))
      .finally(() => setLoading(false))
  }

  if (handler === 'collect') {
    if (done) {
      return (
        <Box s={s} data-form-success="">
          {successMessage || 'Thanks — we’ve received your message.'}
        </Box>
      )
    }
    return (
      <Box as="form" s={s} onSubmit={onCollect} data-loading={loading ? '' : undefined}>
        {Content ? <Content /> : null}
        {/* Honeypot: hidden from real users, catches naive bots. */}
        <input
          type="text"
          name={FORM_HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />
      </Box>
    )
  }

  if (target) {
    return (
      <Box as="form" s={s} onSubmit={onSubmit} data-loading={loading ? '' : undefined}>
        {Content ? <Content /> : null}
      </Box>
    )
  }

  // No handler: unchanged behaviour — post to the given action, or do nothing.
  return (
    <Box
      as="form"
      s={s}
      {...(action ? { action, method } : { onSubmit: (e: FormEvent) => e.preventDefault() })}
    >
      {Content ? <Content /> : null}
    </Box>
  )
}
