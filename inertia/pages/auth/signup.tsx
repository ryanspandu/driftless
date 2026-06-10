import { Link, router } from '@inertiajs/react'
import { FormEvent, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { CaptchaWidget } from '~/components/auth/captcha-widget'
import { GoogleSignInButton } from '~/components/auth/google-sign-in-button'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

export default function SignupPage() {
  const authCfg = useAuthPublicConfig()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const needCaptcha =
    authCfg.data?.captcha.enabled === true &&
    authCfg.data.captcha.onRegister === true &&
    Boolean(authCfg.data.captcha.siteKey) &&
    Boolean(authCfg.data.captcha.provider)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
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
        password,
        username,
        firstName,
        lastName: lastName || undefined,
        ...(needCaptcha && captchaToken ? { captchaToken } : {}),
      },
      {
        onError: (errors) => {
          const msg = errors.error ?? errors.message ?? 'Registration failed'
          setError(typeof msg === 'string' ? msg : 'Registration failed')
        },
        onFinish: () => setLoading(false),
      }
    )
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
      <p className="text-sm text-muted-foreground">Join Driftless to manage your site.</p>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword((v) => !v)}
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
          {loading ? 'Creating…' : 'Sign up'}
        </Button>
      </form>

      {authCfg.data?.google.enabled ? <GoogleSignInButton /> : null}

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
