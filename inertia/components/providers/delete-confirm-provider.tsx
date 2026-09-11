import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

export type ConfirmDeleteOptions = {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** When set, the modal stays open with a loading state until this settles. */
  onConfirm?: () => void | Promise<void>
}

type DeleteConfirmContextValue = {
  confirmDelete: (options: ConfirmDeleteOptions) => Promise<boolean>
}

const DeleteConfirmContext = createContext<DeleteConfirmContextValue | null>(null)

type PendingState = ConfirmDeleteOptions

export function DeleteConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PendingState | null>(null)
  const [isPending, setIsPending] = useState(false)
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed)
    resolverRef.current = null
    setState(null)
    setIsPending(false)
  }, [])

  const confirmDelete = useCallback((options: ConfirmDeleteOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setState(options)
    })
  }, [])

  const handleOpenChange = (open: boolean) => {
    if (!open && !isPending) {
      close(false)
    }
  }

  const handleConfirm = async () => {
    if (!state) return

    if (state.onConfirm) {
      setIsPending(true)
      try {
        await state.onConfirm()
        close(true)
      } catch {
        setIsPending(false)
      }
      return
    }

    close(true)
  }

  const title = state?.title ?? 'Delete item'
  const confirmLabel = state?.confirmLabel ?? 'Delete'
  const cancelLabel = state?.cancelLabel ?? 'Cancel'

  return (
    <DeleteConfirmContext.Provider value={{ confirmDelete }}>
      {children}
      <Dialog open={state !== null} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-lg py-10"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="size-8" />
              </div>
              <div className="space-y-1.5">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{state?.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mt-8 justify-center">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => close(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => void handleConfirm()}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DeleteConfirmContext.Provider>
  )
}

export function useConfirmDelete() {
  const context = useContext(DeleteConfirmContext)
  if (!context) {
    throw new Error('useConfirmDelete must be used within DeleteConfirmProvider')
  }
  return context.confirmDelete
}
