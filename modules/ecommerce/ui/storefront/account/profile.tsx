import { useState, type FormEvent } from 'react'
import { accountApi, type CustomerDto } from '../_api'
import { FIELD_CLASS, SUBMIT_CLASS } from '../_layout'
import { apiErrorMessage } from '~/lib/api-client'

export function ProfileSection({
  customer,
  onUpdated,
}: {
  customer: CustomerDto
  onUpdated: () => Promise<unknown>
}) {
  return (
    <div className="space-y-6">
      <ProfileForm customer={customer} onUpdated={onUpdated} />
      {customer.hasPassword ? (
        <PasswordForm />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
          This account has no password yet, so there is nothing to change here.
        </div>
      )}
    </div>
  )
}

function ProfileForm({
  customer,
  onUpdated,
}: {
  customer: CustomerDto
  onUpdated: () => Promise<unknown>
}) {
  const [firstName, setFirstName] = useState(customer.firstName ?? '')
  const [lastName, setLastName] = useState(customer.lastName ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [acceptsMarketing, setAcceptsMarketing] = useState(customer.acceptsMarketing)
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
        <input value={customer.email} disabled className={`${FIELD_CLASS} opacity-60`} />
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
