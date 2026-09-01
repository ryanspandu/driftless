import { useEffect, useState, type FormEvent } from 'react'
import { accountApi, type AddressDto, type AddressInput } from '../_api'
import { FIELD_CLASS, SUBMIT_CLASS } from '../_layout'
import { CountrySelect } from '../../components/country-select'
import { apiErrorMessage } from '~/lib/api-client'

export function AddressesSection() {
  const [addresses, setAddresses] = useState<AddressDto[] | null>(null)
  const [editing, setEditing] = useState<'new' | string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const { addresses: list } = await accountApi.addresses()
    setAddresses(list)
  }

  useEffect(() => {
    let alive = true
    accountApi
      .addresses()
      .then(({ addresses: list }) => alive && setAddresses(list))
      .catch(() => alive && setError('We could not load your addresses.'))
    return () => {
      alive = false
    }
  }, [])

  const setDefault = async (id: string, role: 'shipping' | 'billing') => {
    const patch = role === 'shipping' ? { isDefaultShipping: true } : { isDefaultBilling: true }
    await accountApi.updateAddress(id, patch).catch((err) => setError(apiErrorMessage(err)))
    await load()
  }

  const remove = async (id: string) => {
    await accountApi.deleteAddress(id).catch((err) => setError(apiErrorMessage(err)))
    await load()
  }

  if (error && !addresses) {
    return <p className="text-sm text-destructive">{error}</p>
  }
  if (!addresses) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Addresses</h2>
        {editing !== 'new' ? (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add address
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {editing === 'new' ? (
        <AddressForm
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      ) : null}

      {addresses.length === 0 && editing !== 'new' ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
          No saved addresses yet. Add one to speed up checkout.
        </div>
      ) : null}

      <div className="space-y-3">
        {addresses.map((address) =>
          editing === address.id ? (
            <AddressForm
              key={address.id}
              address={address}
              onCancel={() => setEditing(null)}
              onSaved={async () => {
                setEditing(null)
                await load()
              }}
            />
          ) : (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => setEditing(address.id)}
              onDelete={() => remove(address.id)}
              onSetDefault={(role) => setDefault(address.id, role)}
            />
          )
        )}
      </div>
    </div>
  )
}

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: AddressDto
  onEdit: () => void
  onDelete: () => void
  onSetDefault: (role: 'shipping' | 'billing') => void
}) {
  const name = [address.firstName, address.lastName].filter(Boolean).join(' ')
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {address.label ? <span className="text-sm font-medium">{address.label}</span> : null}
            {address.isDefaultShipping ? <DefaultPill>Default shipping</DefaultPill> : null}
            {address.isDefaultBilling ? <DefaultPill>Default billing</DefaultPill> : null}
          </div>
          <address className="mt-1.5 text-sm not-italic text-muted-foreground">
            {name ? (
              <>
                {name}
                <br />
              </>
            ) : null}
            {address.company ? (
              <>
                {address.company}
                <br />
              </>
            ) : null}
            {address.line1}
            {address.line2 ? (
              <>
                <br />
                {address.line2}
              </>
            ) : null}
            <br />
            {[address.city, address.state, address.postalCode].filter(Boolean).join(', ')}
            <br />
            {address.country}
            {address.phone ? (
              <>
                <br />
                {address.phone}
              </>
            ) : null}
          </address>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-sm">
        <button type="button" onClick={onEdit} className="font-medium text-primary hover:underline">
          Edit
        </button>
        {!address.isDefaultShipping ? (
          <button
            type="button"
            onClick={() => onSetDefault('shipping')}
            className="text-muted-foreground hover:text-foreground"
          >
            Set default shipping
          </button>
        ) : null}
        {!address.isDefaultBilling ? (
          <button
            type="button"
            onClick={() => onSetDefault('billing')}
            className="text-muted-foreground hover:text-foreground"
          >
            Set default billing
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function AddressForm({
  address,
  onCancel,
  onSaved,
}: {
  address?: AddressDto
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState<AddressInput>({
    label: address?.label ?? '',
    firstName: address?.firstName ?? '',
    lastName: address?.lastName ?? '',
    company: address?.company ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
    phone: address?.phone ?? '',
    isDefaultShipping: address?.isDefaultShipping ?? false,
    isDefaultBilling: address?.isDefaultBilling ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.line1.trim() || !form.city.trim() || !form.country.trim()) {
      setError('Street, city and country are required.')
      return
    }
    setSaving(true)
    try {
      if (address) await accountApi.updateAddress(address.id, form)
      else await accountApi.createAddress(form)
      await onSaved()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <input
        placeholder="Label (e.g. Home)"
        value={form.label ?? ''}
        onChange={(e) => set('label', e.target.value)}
        className={FIELD_CLASS}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          placeholder="First name"
          value={form.firstName ?? ''}
          onChange={(e) => set('firstName', e.target.value)}
          className={FIELD_CLASS}
        />
        <input
          placeholder="Last name"
          value={form.lastName ?? ''}
          onChange={(e) => set('lastName', e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <input
        placeholder="Company (optional)"
        value={form.company ?? ''}
        onChange={(e) => set('company', e.target.value)}
        className={FIELD_CLASS}
      />
      <input
        placeholder="Street address"
        value={form.line1}
        onChange={(e) => set('line1', e.target.value)}
        className={FIELD_CLASS}
      />
      <input
        placeholder="Apartment, suite, etc. (optional)"
        value={form.line2 ?? ''}
        onChange={(e) => set('line2', e.target.value)}
        className={FIELD_CLASS}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          placeholder="City"
          value={form.city}
          onChange={(e) => set('city', e.target.value)}
          className={FIELD_CLASS}
        />
        <input
          placeholder="State / region"
          value={form.state ?? ''}
          onChange={(e) => set('state', e.target.value)}
          className={FIELD_CLASS}
        />
        <input
          placeholder="Postal code"
          value={form.postalCode ?? ''}
          onChange={(e) => set('postalCode', e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CountrySelect value={form.country} onChange={(v) => set('country', v)} />
        <input
          placeholder="Phone (optional)"
          value={form.phone ?? ''}
          onChange={(e) => set('phone', e.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={form.isDefaultShipping ?? false}
            onChange={(e) => set('isDefaultShipping', e.target.checked)}
          />
          Default shipping
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={form.isDefaultBilling ?? false}
            onChange={(e) => set('isDefaultBilling', e.target.checked)}
          />
          Default billing
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className={`${SUBMIT_CLASS} w-auto px-6`}>
          {saving ? 'Saving…' : address ? 'Save address' : 'Add address'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-accent/40"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function DefaultPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      {children}
    </span>
  )
}
