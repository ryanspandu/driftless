import { Link } from '@inertiajs/react'
import { FormEvent, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ApiTokenCreatedDto } from '~/types/api'
import { API_TOKEN_ABILITIES } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import {
  useApiTokens,
  useCreateApiToken,
  useRevokeApiToken,
} from '~/hooks/api/use-api-tokens'
import { cn, formatAdminTableDateTime } from '~/lib/utils'

// Maps the friendly expiry select value to the backend `expiresIn` string
// (Adonis access-token duration). `null` = no expiry.
const EXPIRY_OPTIONS: { value: string; label: string; expiresIn: string | null }[] = [
  { value: 'never', label: 'No expiry', expiresIn: null },
  { value: '30d', label: '30 days', expiresIn: '30 days' },
  { value: '90d', label: '90 days', expiresIn: '90 days' },
  { value: '1y', label: '1 year', expiresIn: '1 year' },
]

const EXPIRY_SELECT_OPTIONS = EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

const ABILITY_LABELS = new Map<string, string>(API_TOKEN_ABILITIES.map((a) => [a.id, a.label]))

function abilityVariant(id: string): 'default' | 'success' | 'warning' {
  if (id === '*') return 'warning'
  return id.endsWith(':write') ? 'default' : 'success'
}

function shortAbilityLabel(id: string): string {
  if (id === '*') return 'Full access'
  return id
}

function ApiTokensPageInner() {
  const confirmDelete = useConfirmDelete()
  const tokensQuery = useApiTokens()
  const createMut = useCreateApiToken()
  const revokeMut = useRevokeApiToken()

  const tokens = tokensQuery.data ?? []

  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [abilities, setAbilities] = useState<string[]>(['content:read'])
  const [expiry, setExpiry] = useState('never')
  const [formError, setFormError] = useState<string | null>(null)

  // Holds the freshly-created token so we can reveal the one-time plaintext.
  const [created, setCreated] = useState<ApiTokenCreatedDto | null>(null)
  const [copied, setCopied] = useState(false)

  function resetForm() {
    setName('')
    setAbilities(['content:read'])
    setExpiry('never')
    setFormError(null)
  }

  function toggleAbility(id: string, checked: boolean) {
    setAbilities((prev) => {
      // Selecting "Full access" supersedes everything else; any other selection
      // clears the wildcard.
      if (id === '*') return checked ? ['*'] : []
      const next = checked ? [...prev, id] : prev.filter((a) => a !== id)
      return next.filter((a) => a !== '*')
    })
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!name.trim()) {
      setFormError('A name is required.')
      return
    }
    if (abilities.length === 0) {
      setFormError('Select at least one ability.')
      return
    }
    const expiresIn = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.expiresIn ?? null
    try {
      const result = await createMut.mutateAsync({
        name: name.trim(),
        abilities,
        expiresIn,
      })
      setCreateOpen(false)
      resetForm()
      setCopied(false)
      setCreated(result)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create token.')
    }
  }

  async function onCopy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.token)
      setCopied(true)
      toast.success('Token copied to clipboard')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select and copy manually.')
    }
  }

  function onRevoke(id: string, tokenName: string | null) {
    void confirmDelete({
      title: 'Revoke token',
      description: `Revoke "${tokenName ?? 'this token'}"? Any app using it will immediately lose access. This cannot be undone.`,
      confirmLabel: 'Revoke',
      onConfirm: async () => {
        await revokeMut.mutateAsync(id)
        toast.success('Token revoked')
      },
    })
  }

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          render={<Link href="/admin/integrations" aria-label="Back to integrations" />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <KeyRound className="size-7 text-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">API Tokens</h1>
            <p className="text-sm text-muted-foreground">
              Personal Access Tokens for the external <code className="rounded bg-muted px-1">/api/v1</code> API.
            </p>
          </div>
        </div>
      </div>

      <PageHeader
        title="Tokens"
        subtitle="A token's effective access is the intersection of its abilities and the owner's permissions."
        count={tokensQuery.isLoading ? undefined : tokens.length}
        actions={
          <Button
            className="gap-2"
            onClick={() => {
              resetForm()
              setCreateOpen(true)
            }}
          >
            <Plus className="size-4" />
            Create token
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Abilities</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokensQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : tokensQuery.error ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-destructive">
                  {(tokensQuery.error as Error).message}
                </TableCell>
              </TableRow>
            ) : tokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10">
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <KeyRound className="size-5" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No tokens yet</p>
                    <p className="text-xs text-muted-foreground">
                      Create a token to let an external app call the API.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">{token.name ?? 'Untitled'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {token.abilities.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        token.abilities.map((a) => (
                          <Badge key={a} variant={abilityVariant(a)} title={ABILITY_LABELS.get(a) ?? a}>
                            {shortAbilityLabel(a)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {token.lastUsedAt ? formatAdminTableDateTime(token.lastUsedAt) : 'Never'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {token.expiresAt ? formatAdminTableDateTime(token.expiresAt) : 'No expiry'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatAdminTableDateTime(token.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => onRevoke(token.id, token.name)}
                    >
                      <Trash2 className="size-4" />
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={onCreate}>
            <DialogHeader>
              <DialogTitle>Create API token</DialogTitle>
              <DialogDescription>
                Name the token, pick its abilities, and choose an optional expiry. The plaintext token is
                shown only once after creation.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token-name">Name</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Marketing site"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Abilities</Label>
                <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                  {API_TOKEN_ABILITIES.map((ability) => {
                    const checked = abilities.includes(ability.id)
                    return (
                      <label
                        key={ability.id}
                        htmlFor={`ability-${ability.id}`}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          id={`ability-${ability.id}`}
                          checked={checked}
                          onCheckedChange={(v) => toggleAbility(ability.id, !!v)}
                        />
                        <span className={cn(ability.id === '*' && 'font-medium')}>{ability.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="token-expiry">Expiry</Label>
                <AppSelect
                  id="token-expiry"
                  value={expiry}
                  onChange={(v) => setExpiry(v || 'never')}
                  options={EXPIRY_SELECT_OPTIONS}
                  isSearchable={false}
                />
              </div>

              {formError ? (
                <p className="text-sm text-destructive" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create token'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* One-time plaintext reveal dialog */}
      <Dialog open={created != null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription>
              Copy your token now. For security, it will not be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Store this token securely. Anyone with it can access the API within its abilities until it is
                revoked.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
                {created?.token}
              </code>
              <Button type="button" variant="outline" size="icon" onClick={onCopy} aria-label="Copy token">
                {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setCreated(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ApiTokensPage() {
  return (
    <Can permission="token:manage" fallback={<NoAccess />}>
      <ApiTokensPageInner />
    </Can>
  )
}

function NoAccess() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">API Tokens</h1>
      <p className="text-sm text-muted-foreground">
        You need the <code className="rounded bg-muted px-1">token:manage</code> permission to manage API
        tokens.
      </p>
      <Button variant="outline" render={<Link href="/admin/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  )
}
