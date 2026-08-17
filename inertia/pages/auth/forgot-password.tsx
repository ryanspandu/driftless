import { Link, router } from '@inertiajs/react'
import { FormEvent, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    // The server always redirects to /login with the same generic flash, so
    // there is no success branch to render here — and deliberately no way for
    // this page to reveal whether the address was registered.
    router.post('/forgot-password', { email }, { onFinish: () => setLoading(false) })
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Forgot password
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Enter your email and we&apos;ll send a link to choose a new password.
      </p>

      <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
