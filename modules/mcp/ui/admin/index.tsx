import { type FormEvent, useState } from 'react'
import { AlertTriangle, Check, Copy, Plus, Plug, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { cn, formatAdminTableDateTime } from '~/lib/utils'
import {
  MCP_ABILITY_OPTIONS,
  useCreateMcpToken,
  useMcpAudit,
  useMcpTokens,
  useRevokeMcpToken,
  type McpTokenCreatedDto,
} from './_api'
import { ConnectDialog } from './connect-dialog'

const EXPIRY_OPTIONS = [
  { value: 'never', label: 'No expiry', expiresIn: null as string | null },
  { value: '30d', label: '30 days', expiresIn: '30 days' },
  { value: '90d', label: '90 days', expiresIn: '90 days' },
  { value: '1y', label: '1 year', expiresIn: '1 year' },
]
const EXPIRY_SELECT_OPTIONS = EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

function abilityVariant(id: string): 'default' | 'success' | 'warning' {
  if (id === '*') return 'warning'
  if (id.endsWith(':write') || id === 'builder:collections' || id === 'builder:pages')
    return 'default'
  return 'success'
}

function statusVariant(status: number): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status >= 200 && status < 300) return 'success'
  if (status === 401 || status === 403) return 'warning'
  if (status >= 400) return 'destructive'
  return 'secondary'
}

export default function MCPAdminPage() {
  const confirmDelete = useConfirmDelete()
  const tokensQuery = useMcpTokens()
  const auditQuery = useMcpAudit()
  const createMut = useCreateMcpToken()
  const revokeMut = useRevokeMcpToken()

  const tokens = tokensQuery.data ?? []
  const audit = auditQuery.data?.data ?? []

  const [connectOpen, setConnectOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [abilities, setAbilities] = useState<string[]>(['builder:read'])
  const [expiry, setExpiry] = useState('never')
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<McpTokenCreatedDto | null>(null)
  const [copied, setCopied] = useState(false)

  function resetForm() {
    setName('')
    setAbilities(['builder:read'])
    setExpiry('never')
    setFormError(null)
  }

  function toggleAbility(id: string, on: boolean) {
    setAbilities((prev) => {
      if (id === '*') return on ? ['*'] : []
      const next = on ? [...prev.filter((a) => a !== '*'), id] : prev.filter((a) => a !== id)
      return next
    })
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!name.trim()) return setFormError('A name is required.')
    if (abilities.length === 0) return setFormError('Select at least one scope.')
    const expiresIn = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.expiresIn ?? null
    try {
      const result = await createMut.mutateAsync({ name: name.trim(), abilities, expiresIn })
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
      description: `Revoke "${tokenName ?? 'this token'}"? Any client using it loses access immediately. This cannot be undone.`,
      confirmLabel: 'Revoke',
      onConfirm: async () => {
        await revokeMut.mutateAsync(id)
        toast.success('Token revoked')
      },
    })
  }

  return (
    <div className="w-full max-w-none space-y-8">
      <PageHeader
        title="MCP"
        subtitle="Let an AI assistant build this site over the Model Context Protocol."
      />

      {/* Setup */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plug className="size-4 text-primary" /> Connect a client
          </div>
          <p className="text-sm text-muted-foreground">
            Get step-by-step config for Claude or Codex — remote (nothing to install) or a local
            stdio bridge. Create a token first, below.
          </p>
        </div>
        <Button variant="outline" className="shrink-0 gap-2" onClick={() => setConnectOpen(true)}>
          <Plug className="size-4" /> Connect
        </Button>
      </div>

      {/* Tokens */}
      <div className="space-y-3">
        <PageHeader
          title="Tokens"
          subtitle="A token's effective access is its scopes ∩ the owner's permissions."
          count={tokensQuery.isLoading ? undefined : tokens.length}
          actions={
            <Button
              className="gap-2"
              onClick={() => {
                resetForm()
                setCreateOpen(true)
              }}
            >
              <Plus className="size-4" /> Create token
            </Button>
          }
        />
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokensQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : tokens.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No MCP tokens yet. Create one to connect a client.
                  </TableCell>
                </TableRow>
              ) : (
                tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">{token.name ?? 'Untitled'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {token.abilities.map((a) => (
                          <Badge key={a} variant={abilityVariant(a)}>
                            {a === '*' ? 'Full access' : a}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {token.lastUsedAt ? formatAdminTableDateTime(token.lastUsedAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {token.expiresAt ? formatAdminTableDateTime(token.expiresAt) : 'No expiry'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => onRevoke(token.id, token.name)}
                      >
                        <Trash2 className="size-4" /> Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Activity */}
      <div className="space-y-3">
        <PageHeader
          title="Activity"
          subtitle="Every builder-API call, newest first — including denied attempts."
        />
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : audit.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No activity yet.
                  </TableCell>
                </TableRow>
              ) : (
                audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatAdminTableDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.action}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.tokenName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {row.durationMs}ms
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={onCreate}>
            <DialogHeader>
              <DialogTitle>Create MCP token</DialogTitle>
              <DialogDescription>
                Name it, pick its scopes, and choose an optional expiry. The plaintext token is
                shown only once.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token-name">Name</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Build bot"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3">
                  {MCP_ABILITY_OPTIONS.map((ability) => (
                    <label
                      key={ability.id}
                      htmlFor={`ability-${ability.id}`}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`ability-${ability.id}`}
                        className="mt-0.5"
                        checked={abilities.includes(ability.id)}
                        onCheckedChange={(v) => toggleAbility(ability.id, !!v)}
                      />
                      <span>
                        <span className={cn(ability.id === '*' && 'font-medium')}>
                          {ability.label}
                        </span>{' '}
                        <span className="text-xs text-muted-foreground">— {ability.hint}</span>
                      </span>
                    </label>
                  ))}
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

      {/* One-time reveal */}
      <Dialog open={created != null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription>Copy it now — it will not be shown again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Store it securely. Anyone with it can use the API within its scopes until revoked.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
                {created?.token}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onCopy}
                aria-label="Copy token"
              >
                {copied ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Copy className="size-4" />
                )}
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

      <ConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  )
}
