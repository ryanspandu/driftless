import { Link, router } from '@inertiajs/react'
import { FormEvent, useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { CaptchaWidget } from '~/components/auth/captcha-widget'
import { GoogleSignInButton } from '~/components/auth/google-sign-in-button'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

export default function LoginPage() {
  const authCfg = useAuthPublicConfig()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('expired')) {
      setError('Your session has expired. Please sign in again.')
      window.history.replaceState({}, '', '/login')
    }
  }, [])

  const needCaptcha =
    authCfg.data?.captcha.enabled === true &&
    authCfg.data.captcha.onLogin === true &&
    Boolean(authCfg.data.captcha.siteKey) &&
    Boolean(authCfg.data.captcha.provider)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (needCaptcha && !captchaToken?.trim()) {
      setError('Complete the verification challenge before signing in.')
      return
    }
    setLoading(true)
    router.post(
      '/login',
      {
        login,
        password,
        ...(needCaptcha && captchaToken ? { captchaToken } : {}),
      },
      {
        onError: (errors) => {
          const msg = errors.error ?? errors.message ?? 'Login failed'
          setError(typeof msg === 'string' ? msg : 'Login failed')
        },
        onFinish: () => setLoading(false),
      }
    )
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Sign in</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Access drafts, published pages, and media in one place.
      </p>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="login">Email or username</Label>
          <Input
            id="login"
            type="text"
            autoComplete="username"
            value={login}
            onChange={(ev) => setLogin(ev.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {needCaptcha && authCfg.data?.captcha ? (
          <CaptchaWidget
            provider={authCfg.data.captcha.provider!}
            siteKey={authCfg.data.captcha.siteKey!}
            onToken={setCaptchaToken}
          />
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {authCfg.data?.google.enabled ? (
        <div className="space-y-3">
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">or</span>
          </div>
          <GoogleSignInButton />
        </div>
      ) : null}

      {/* `/register` 404s when public sign-up is off, so only offer it when open. */}
      {authCfg.data?.registrationEnabled ? (
        <p className="text-center text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      ) : null}
    </div>
  )
}
