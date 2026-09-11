import { Link, router } from '@inertiajs/react'
import { FormEvent, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

interface Props {
  token: string
  /** The link is expired, already spent, or was never ours. */
  invalid: boolean
  requestPath: string
}

export default function ResetPasswordPage({ token, invalid, requestPath }: Props) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
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

  if (invalid) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Link expired
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This reset link has expired or was already used. Reset links work once and last one
          hour.
        </p>
        <Link
          href={requestPath}
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Choose a new password
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        At least 8 characters. You&apos;ll sign in with it straight after.
      </p>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              minLength={8}
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

        <div className="space-y-2">
          <Label htmlFor="passwordConfirmation">Confirm password</Label>
          <Input
            id="passwordConfirmation"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmation}
            onChange={(ev) => setConfirmation(ev.target.value)}
            required
            minLength={8}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </div>
  )
}
