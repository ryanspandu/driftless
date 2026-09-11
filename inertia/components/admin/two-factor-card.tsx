import { useEffect, useState, type FC } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Badge } from '~/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import api, { toApiError } from '~/lib/api'

/** Admin authenticator-app 2FA — enrol wizard + disable, matching the profile card style. */
const TwoFactorCard: FC<{ enabled: boolean; onChange: (enabled: boolean) => void }> = ({
  enabled,
  onChange,
}) => {
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  return (
    <section className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground">Security</p>
      <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
              enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
            }`}
          >
            {enabled ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Two-factor authentication</h3>
              {enabled ? (
                <Badge variant="success" className="gap-1">
                  <span className="text-emerald-500">•</span>Enabled
                </Badge>
              ) : (
                <Badge variant="secondary">Off</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? 'A code from your authenticator app is required at each sign-in.'
                : 'Add an authenticator app for a second step at sign-in.'}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          {enabled ? (
            <Button variant="outline" onClick={() => setDisableOpen(true)}>
              Disable
            </Button>
          ) : (
            <Button onClick={() => setEnrollOpen(true)}>Enable</Button>
          )}
        </div>
      </div>

      {enrollOpen ? (
        <EnrollDialog
          onClose={() => setEnrollOpen(false)}
          onDone={() => {
            setEnrollOpen(false)
            onChange(true)
          }}
        />
      ) : null}

      {disableOpen ? (
        <DisableDialog
          onClose={() => setDisableOpen(false)}
          onDone={() => {
            setDisableOpen(false)
            onChange(false)
          }}
        />
      ) : null}
    </section>
  )
}

/** Enrol: fetch secret+QR on open, confirm a code, then reveal recovery codes once. */
const EnrollDialog: FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const [step, setStep] = useState<'scan' | 'recovery'>('scan')
  const [uri, setUri] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Kick off enrolment when the dialog mounts.
  useEffect(() => {
    let live = true
    api
      .post('/api/me/2fa/enroll')
      .then((r) => {
        if (!live) return
        setUri(r.data.otpauthUri)
        setSecret(r.data.secret)
      })
      .catch((e) => live && setError(toApiError(e).message))
      .finally(() => live && setStarting(false))
    return () => {
      live = false
    }
  }, [])

  async function confirm() {
    setError(null)
    setLoading(true)
    try {
      const r = await api.post('/api/me/2fa/confirm', { code: code.trim() })
      setRecoveryCodes(r.data.recoveryCodes)
      setStep('recovery')
    } catch (e) {
      setError(toApiError(e).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        {step === 'scan' ? (
          <>
            <DialogHeader>
              <DialogTitle>Set up authenticator</DialogTitle>
              <DialogDescription>
                Scan this QR code with Google Authenticator, 1Password, Authy or similar, then enter
                the 6-digit code.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                {starting || !uri ? (
                  <div className="flex size-40 items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <QRCodeSVG value={uri} size={160} />
                )}
              </div>
              {secret ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Or enter this key manually</p>
                  <code className="block break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">
                    {secret}
                  </code>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="totp-code">Verification code</Label>
                <Input
                  id="totp-code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={confirm} disabled={loading || code.trim().length < 6}>
                {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Verify &amp; enable
              </Button>
            </DialogFooter>
          </>
        ) : (
          <RecoveryStep codes={recoveryCodes} onDone={onDone} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Recovery codes — shown exactly once; the user must acknowledge saving them. */
const RecoveryStep: FC<{ codes: string[]; onDone: () => void }> = ({ codes, onDone }) => {
  const [copied, setCopied] = useState(false)

  function copyAll() {
    void navigator.clipboard?.writeText(codes.join('\n')).then(() => {
      setCopied(true)
      toast.success('Recovery codes copied')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Save your recovery codes</DialogTitle>
        <DialogDescription>
          Store these somewhere safe. Each can be used once if you lose access to your
          authenticator. They won&apos;t be shown again.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((c) => (
          <span key={c} className="tracking-wide">
            {c}
          </span>
        ))}
      </div>
      <DialogFooter className="sm:justify-between">
        <Button variant="outline" onClick={copyAll} className="gap-2">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          Copy codes
        </Button>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  )
}

/** Disable — requires the account password. */
const DisableDialog: FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setLoading(true)
    try {
      await api.post('/api/me/2fa/disable', { password })
      toast.success('Two-factor authentication disabled')
      onDone()
    } catch (e) {
      setError(toApiError(e).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disable two-factor authentication</DialogTitle>
          <DialogDescription>
            Confirm your password to turn off 2FA. Your account will be protected by password only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="disable-pw">Password</Label>
          <Input
            id="disable-pw"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={loading || !password}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Disable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default TwoFactorCard
