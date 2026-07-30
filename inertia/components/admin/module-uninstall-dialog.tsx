import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useUninstallModule } from '~/hooks/api/use-schema'
import { apiErrorMessage } from '~/lib/api-client'
import type { ModuleDto } from '~/types/api'

/**
 * Confirms dropping a module's tables and everything in them.
 *
 * Typing the module name is not a security control — whoever gets here already
 * holds `module:uninstall` — it is a deliberate pause in front of an
 * irreversible drop. The server enforces the real guards: the permission, the
 * matching confirmation string, and the module's own `canUninstall()` veto.
 */
export function ModuleUninstallDialog({
  module: mod,
  open,
  onOpenChange,
}: {
  module: ModuleDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const uninstall = useUninstallModule()
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setConfirm('')
      setError(null)
    }
  }, [open])

  const matches = Boolean(mod) && confirm.trim() === mod!.name

  async function onConfirm() {
    if (!mod || !matches) return
    setError(null)
    try {
      await uninstall.mutateAsync({ name: mod.name, confirm: confirm.trim() })
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to uninstall'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Uninstall {mod?.label}</DialogTitle>
          <DialogDescription>
            Drops every table this module owns and deletes the data in them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p>
              This cannot be undone. Disabling the module instead keeps all its data and hides it
              from the sidebar.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="uninstall-confirm">
              Type <span className="font-mono font-medium">{mod?.name}</span> to confirm
            </Label>
            <Input
              id="uninstall-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uninstall.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!matches || uninstall.isPending}
            className="gap-2"
          >
            {uninstall.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {uninstall.isPending ? 'Uninstalling…' : 'Uninstall'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
