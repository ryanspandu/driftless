import { router, usePage } from '@inertiajs/react'
import { useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

export default function TwoFactorPage() {
  const page = usePage()
  const flashError = (page.props as { errors?: Record<string, string> }).errors?.error ?? null
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    router.post(
      '/login/2fa',
      { code },
      {
        onError: (errors) => {
          const msg = errors.error ?? errors.message ?? 'Verification failed'
          setError(typeof msg === 'string' ? msg : 'Verification failed')
        },
        onFinish: () => setLoading(false),
      }
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Two-factor authentication
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Enter the 6-digit code from your authenticator app. You can also use one of your recovery
          codes.
        </p>
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="code">Authentication code</Label>
          <Input
            id="code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            placeholder="123456"
            required
          />
        </div>

        {(error ?? flashError) ? (
          <p className="text-sm text-destructive">{error ?? flashError}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={loading || code.trim().length === 0}>
          {loading ? 'Verifying…' : 'Verify'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <a href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </a>
      </p>
    </div>
  )
}
