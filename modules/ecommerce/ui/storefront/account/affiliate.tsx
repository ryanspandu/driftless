import { useEffect, useState, type FormEvent } from 'react'
import { Head } from '@inertiajs/react'
import { accountApi, ShopError, type AffiliateOverviewDto, type PayoutMethodInput } from '../_api'
import { FIELD_CLASS, SUBMIT_CLASS } from '../_layout'
import { apiErrorMessage } from '~/lib/api-client'

/**
 * The affiliate tab. Self-fetching (like `AddressesSection`), it adapts to the
 * account's affiliate state: apply → pending → active (analytics + payouts).
 *
 * Also usable standalone via the `AffiliateBlock` page-builder block, so it
 * handles the signed-out case itself rather than relying on the account shell.
 */
export function AffiliateSection() {
  const [data, setData] = useState<AffiliateOverviewDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    accountApi
      .affiliate()
      .then((d) => live && setData(d))
      .catch((e) => {
        if (!live) return
        if (e instanceof ShopError && e.status === 401) setSignedOut(true)
        else setError(apiErrorMessage(e))
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  if (loading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
  }
  if (signedOut) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold tracking-tight">Affiliate program</h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
          Sign in to your account to join the affiliate program and track your referrals.
        </p>
        <a href="/shop/account/login" className={`${SUBMIT_CLASS} mt-5 inline-flex w-auto px-6`}>
          Sign in
        </a>
      </div>
    )
  }
  if (error || !data) {
    return <p className="py-16 text-center text-sm text-destructive">{error ?? 'Unavailable.'}</p>
  }

  return <AffiliateBody data={data} onChange={setData} />
}

/**
 * Standalone affiliate portal, for the `AffiliateBlock` page-builder block —
 * an operator can feature the program on any page (e.g. `/partners`).
 */
export function AffiliateScreen({ embedded }: { embedded?: boolean } = {}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      {!embedded && <Head title="Affiliate program" />}
      <AffiliateSection />
    </div>
  )
}

function AffiliateBody({
  data,
  onChange,
}: {
  data: AffiliateOverviewDto
  onChange: (d: AffiliateOverviewDto) => void
}) {
  if (data.state === 'none')
    return (
      <ApplyForm variant="apply" commissionPercent={data.commissionPercent} onApplied={onChange} />
    )
  if (data.state === 'pending')
    return (
      <Notice
        title="Application under review"
        body="Your affiliate application is pending approval. We'll email you once it's reviewed."
      />
    )
  if (data.state === 'rejected')
    return (
      <ApplyForm
        variant="rejected"
        commissionPercent={data.commissionPercent}
        onApplied={onChange}
      />
    )
  if (data.state === 'blocked')
    return (
      <ApplyForm
        variant="blocked"
        commissionPercent={data.commissionPercent}
        onApplied={onChange}
      />
    )
  if (data.state === 'paused')
    return (
      <Notice
        title="Affiliate paused"
        body="Your affiliate account is currently paused. Contact support for details."
        tone="muted"
      />
    )

  return <ActiveDashboard data={data} onChange={onChange} />
}

const APPLY_COPY = {
  apply: {
    title: 'Become an affiliate',
    intro: (pct: number) =>
      `Share products with your audience and earn ${pct}% commission on every sale you refer. You'll get a personal referral link and can track clicks, commissions and payouts right here.`,
    label: 'Anything you’d like us to know? (optional)',
    button: 'Apply now',
    require: false,
  },
  rejected: {
    title: 'Application not approved',
    intro: () =>
      'Your previous application was not approved. You can request another review below.',
    label: 'Why should we reconsider? This goes to the team reviewing your application.',
    button: 'Request review again',
    require: true,
  },
  blocked: {
    title: 'Affiliate account blocked',
    intro: () => 'Your affiliate account is blocked. You can appeal for a review below.',
    label: 'Add a note for the team reviewing your appeal.',
    button: 'Request review again',
    require: true,
  },
} as const

function ApplyForm({
  variant,
  commissionPercent,
  onApplied,
}: {
  variant: keyof typeof APPLY_COPY
  commissionPercent: number
  onApplied: (d: AffiliateOverviewDto) => void
}) {
  const copy = APPLY_COPY[variant]
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (copy.require && !message.trim()) {
      setError('Please add a note explaining your request.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      onApplied(await accountApi.applyAffiliate({ message: message.trim() || undefined }))
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{copy.title}</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {variant === 'apply' ? (
            <>
              Share products with your audience and earn{' '}
              <span className="font-semibold text-foreground">{commissionPercent}%</span> commission
              on every sale you refer. You'll get a personal referral link and can track clicks,
              commissions and payouts right here.
            </>
          ) : (
            copy.intro(commissionPercent)
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="aff-msg" className="text-sm font-medium">
          {copy.label}
        </label>
        <textarea
          id="aff-msg"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${FIELD_CLASS} min-h-[84px]`}
          placeholder={variant === 'apply' ? 'Tell us about your audience…' : 'Your note…'}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button type="submit" disabled={loading} className={`${SUBMIT_CLASS} w-auto px-6`}>
        {loading ? 'Submitting…' : copy.button}
      </button>
    </form>
  )
}

function Notice({
  title,
  body,
  tone = 'info',
}: {
  title: string
  body: string
  tone?: 'info' | 'muted'
}) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm sm:p-8 ${
        tone === 'muted' ? 'border-border bg-muted/20' : 'border-primary/20 bg-primary/5'
      }`}
    >
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function ActiveDashboard({
  data,
  onChange,
}: {
  data: AffiliateOverviewDto
  onChange: (d: AffiliateOverviewDto) => void
}) {
  const referralUrl =
    typeof window !== 'undefined' && data.referralPath
      ? `${window.location.origin}${data.referralPath}`
      : (data.referralPath ?? '')
  const [copied, setCopied] = useState(false)

  return (
    <div className="space-y-6">
      {/* Referral link */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold tracking-tight">Your referral link</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Earn {data.commissionPercent}% on every referred sale. Share this link:
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={referralUrl} className={`${FIELD_CLASS} font-mono text-xs`} />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(referralUrl).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1_500)
              })
            }}
            className={`${SUBMIT_CLASS} w-auto shrink-0 px-6`}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available" value={data.available.formatted} strong />
        <Stat label="Pending" value={data.pending.formatted} />
        <Stat label="In withdrawal" value={data.inWithdrawal.formatted} />
        <Stat label="Paid out" value={data.paid.formatted} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Clicks" value={String(data.clicksCount)} />
        <Stat label="Referred orders" value={String(data.ordersCount)} />
      </div>

      <PayoutAndWithdraw data={data} onChange={onChange} />

      {/* Recent commissions */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold tracking-tight">Recent commissions</h2>
        {data.recentCommissions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No commissions yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border">
            {data.recentCommissions.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium">{c.orderNumber}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{c.ratePercent}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <CommissionBadge status={c.status} />
                  <span className="font-medium tabular-nums">{c.amount.formatted}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdrawal history */}
      {data.withdrawals.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold tracking-tight">Withdrawals</h2>
          <div className="mt-3 divide-y divide-border">
            {data.withdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-muted-foreground">
                  {new Date(w.requestedAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-3">
                  <WithdrawalBadge status={w.status} />
                  <span className="font-medium tabular-nums">{w.amount.formatted}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PayoutAndWithdraw({
  data,
  onChange,
}: {
  data: AffiliateOverviewDto
  onChange: (d: AffiliateOverviewDto) => void
}) {
  const [type, setType] = useState<'bank' | 'ewallet' | 'paypal'>(data.payoutMethod?.type ?? 'bank')
  const [bankName, setBankName] = useState('')
  const [provider, setProvider] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function savePayout(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    let input: PayoutMethodInput
    if (type === 'bank') input = { type, bankName, accountNumber, accountHolder }
    else if (type === 'ewallet') input = { type, provider, accountNumber, accountHolder }
    else input = { type, email }
    setSaving(true)
    try {
      onChange(await accountApi.setPayoutMethod(input))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function withdraw() {
    setError(null)
    setWithdrawing(true)
    try {
      onChange(await accountApi.requestWithdrawal())
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">Payout</h2>
        <button
          onClick={withdraw}
          disabled={!data.canWithdraw || withdrawing}
          className={`${SUBMIT_CLASS} w-auto px-5 disabled:opacity-50`}
          title={
            data.canWithdraw
              ? ''
              : `Available balance must reach ${data.minWithdrawal.formatted} and a payout method must be set.`
          }
        >
          {withdrawing ? 'Requesting…' : `Withdraw ${data.available.formatted}`}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Minimum withdrawal {data.minWithdrawal.formatted}.
        {data.payoutMethod ? ` Current method: ${data.payoutMethod.summary}.` : ''}
      </p>

      <form onSubmit={savePayout} className="mt-4 space-y-3">
        <div className="flex gap-2">
          {(['bank', 'ewallet', 'paypal'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${
                type === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {t === 'ewallet' ? 'E-wallet' : t}
            </button>
          ))}
        </div>

        {type === 'bank' ? (
          <>
            <input
              placeholder="Bank name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={FIELD_CLASS}
            />
            <input
              placeholder="Account number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className={FIELD_CLASS}
            />
            <input
              placeholder="Account holder name"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className={FIELD_CLASS}
            />
          </>
        ) : type === 'ewallet' ? (
          <>
            <input
              placeholder="Provider (e.g. GoPay, OVO, DANA)"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className={FIELD_CLASS}
            />
            <input
              placeholder="Account number / phone"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className={FIELD_CLASS}
            />
            <input
              placeholder="Account holder name"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className={FIELD_CLASS}
            />
          </>
        ) : (
          <input
            placeholder="PayPal email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD_CLASS}
          />
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className={`${SUBMIT_CLASS} w-auto px-6`}>
            {saving ? 'Saving…' : 'Save payout method'}
          </button>
          {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
        </div>
      </form>
    </div>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 tabular-nums ${strong ? 'text-lg font-semibold text-foreground' : 'text-base font-medium'}`}
      >
        {value}
      </p>
    </div>
  )
}

function CommissionBadge({ status }: { status: 'pending' | 'approved' | 'paid' | 'void' }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-600',
    approved: 'bg-blue-500/10 text-blue-600',
    paid: 'bg-emerald-500/10 text-emerald-600',
    void: 'bg-muted text-muted-foreground line-through',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>
  )
}

function WithdrawalBadge({ status }: { status: 'requested' | 'paid' | 'rejected' }) {
  const map: Record<string, string> = {
    requested: 'bg-amber-500/10 text-amber-600',
    paid: 'bg-emerald-500/10 text-emerald-600',
    rejected: 'bg-destructive/10 text-destructive',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>
  )
}
