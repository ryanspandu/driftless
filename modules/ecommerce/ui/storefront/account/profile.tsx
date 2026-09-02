import { useEffect, useState, type FormEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { accountApi, type AccountDto } from '../_api'
import { FIELD_CLASS, SUBMIT_CLASS } from '../_layout'
import { apiErrorMessage } from '~/lib/api-client'

export function ProfileSection({
  account,
  onUpdated,
}: {
  account: AccountDto
  onUpdated: () => Promise<unknown>
}) {
  return (
    <div className="space-y-6">
      <ProfileForm account={account} onUpdated={onUpdated} />
      {account.hasPassword ? (
        <>
          <PasswordForm />
          <TwoFactorForm account={account} onUpdated={onUpdated} />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
          This account has no password yet, so there is nothing to change here.
        </div>
      )}
    </div>
  )
}

function ProfileForm({
  account,
  onUpdated,
}: {
  account: AccountDto
  onUpdated: () => Promise<unknown>
}) {
  const [firstName, setFirstName] = useState(account.firstName ?? '')
  const [lastName, setLastName] = useState(account.lastName ?? '')
  const [phone, setPhone] = useState(account.phone ?? '')
  const [acceptsMarketing, setAcceptsMarketing] = useState(account.acceptsMarketing)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await accountApi.updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null,
        acceptsMarketing,
      })
      await onUpdated()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <h2 className="text-base font-semibold tracking-tight">Your details</h2>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">Email</label>
        <input value={account.email} disabled className={`${FIELD_CLASS} opacity-60`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="p-first" className="text-sm font-medium">
            First name
          </label>
          <input
            id="p-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="p-last" className="text-sm font-medium">
            Last name
          </label>
          <input
            id="p-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="p-phone" className="text-sm font-medium">
          Phone
        </label>
        <input
          id="p-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={acceptsMarketing}
          onChange={(e) => setAcceptsMarketing(e.target.checked)}
        />
        <span className="text-muted-foreground">Email me about offers and news.</span>
      </label>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={`${SUBMIT_CLASS} w-auto px-6`}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
      </div>
    </form>
  )
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    setSaving(true)
    try {
      await accountApi.changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <h2 className="text-base font-semibold tracking-tight">Password</h2>

      <div className="space-y-1.5">
        <label htmlFor="p-current" className="text-sm font-medium">
          Current password
        </label>
        <input
          id="p-current"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="p-new" className="text-sm font-medium">
          New password
        </label>
        <input
          id="p-new"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={FIELD_CLASS}
        />
        <p className="text-xs text-muted-foreground">Changing it signs you out everywhere else.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={`${SUBMIT_CLASS} w-auto px-6`}>
          {saving ? 'Updating…' : 'Update password'}
        </button>
        {saved ? <span className="text-sm text-emerald-600">Updated</span> : null}
      </div>
    </form>
  )
}

/**
 * Authenticator-app 2FA management, mirroring the admin card: enrol wizard
 * (scan → confirm → recovery codes) and disable-with-password.
 */
function TwoFactorForm({
  account,
  onUpdated,
}: {
  account: AccountDto
  onUpdated: () => Promise<unknown>
}) {
  const [mode, setMode] = useState<'idle' | 'enrolling' | 'disabling'>('idle')

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight">Two-factor authentication</h2>
          <p className="text-sm text-muted-foreground">
            {account.twoFactorEnabled
              ? 'On — a code from your authenticator app is required at sign-in.'
              : 'Add an authenticator app for a second step when you sign in.'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            account.twoFactorEnabled
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {account.twoFactorEnabled ? 'Enabled' : 'Off'}
        </span>
      </div>

      {mode === 'idle' ? (
        account.twoFactorEnabled ? (
          <button
            type="button"
            onClick={() => setMode('disabling')}
            className={`${SUBMIT_CLASS} w-auto bg-transparent px-6 text-foreground ring-1 ring-inset ring-border hover:bg-muted`}
          >
            Disable
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode('enrolling')}
            className={`${SUBMIT_CLASS} w-auto px-6`}
          >
            Enable
          </button>
        )
      ) : null}

      {mode === 'enrolling' ? (
        <TwoFactorEnroll
          onCancel={() => setMode('idle')}
          onDone={async () => {
            await onUpdated()
            setMode('idle')
          }}
        />
      ) : null}

      {mode === 'disabling' ? (
        <TwoFactorDisable
          onCancel={() => setMode('idle')}
          onDone={async () => {
            await onUpdated()
            setMode('idle')
          }}
        />
      ) : null}
    </div>
  )
}

/** Enrol: fetch QR on mount, confirm a code, then reveal recovery codes once. */
function TwoFactorEnroll({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [uri, setUri] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start enrolment when this view mounts.
  useEffect(() => {
    let live = true
    accountApi
      .beginEnroll2fa()
      .then((r) => {
        if (!live) return
        setUri(r.otpauthUri)
        setSecret(r.secret)
      })
      .catch((err) => live && setError(apiErrorMessage(err)))
    return () => {
      live = false
    }
  }, [])

  async function confirm(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await accountApi.confirmEnroll2fa({ code: code.trim() })
      setRecoveryCodes(r.recoveryCodes)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (recoveryCodes) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Save your recovery codes</h3>
          <p className="text-xs text-muted-foreground">
            Store these somewhere safe. Each works once if you lose your authenticator. They
            won&apos;t be shown again.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
          {recoveryCodes.map((c) => (
            <span key={c} className="tracking-wide">
              {c}
            </span>
          ))}
        </div>
        <button type="button" onClick={onDone} className={`${SUBMIT_CLASS} w-auto px-6`}>
          Done
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={confirm} className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <p className="text-sm text-muted-foreground">
        Scan this with Google Authenticator, 1Password, Authy or similar, then enter the 6-digit
        code.
      </p>
      <div className="flex justify-center rounded-lg bg-white p-4">
        {uri ? (
          <QRCodeSVG value={uri} size={152} />
        ) : (
          <div className="flex size-[152px] items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
      {secret ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Or enter this key manually</p>
          <code className="block break-all rounded bg-background px-2 py-1.5 font-mono text-xs">
            {secret}
          </code>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <label htmlFor="tf-code" className="text-sm font-medium">
          Verification code
        </label>
        <input
          id="tf-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || code.trim().length < 6}
          className={`${SUBMIT_CLASS} w-auto px-6`}
        >
          {loading ? 'Verifying…' : 'Verify & enable'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/** Disable — requires the account password. */
function TwoFactorDisable({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await accountApi.disable2fa({ password })
      onDone()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="space-y-1.5">
        <label htmlFor="tf-pw" className="text-sm font-medium">
          Confirm your password
        </label>
        <input
          id="tf-pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading || !password}
          className={`${SUBMIT_CLASS} w-auto bg-destructive px-6 hover:bg-destructive/90`}
        >
          {loading ? 'Disabling…' : 'Disable 2FA'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
