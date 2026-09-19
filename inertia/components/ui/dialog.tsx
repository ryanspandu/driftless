import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '~/lib/utils'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

const DIALOG_ANIMATION_MS = 200

function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Keep the dialog mounted through the close animation, then unmount.
  const [mounted, setMounted] = React.useState(open)
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setMounted(true)
      // Defer to the next tick so the enter transition runs from the closed state.
      const t = window.setTimeout(() => setVisible(true), 10)
      return () => window.clearTimeout(t)
    }
    setVisible(false)
    const t = window.setTimeout(() => setMounted(false), DIALOG_ANIMATION_MS)
    return () => window.clearTimeout(t)
  }, [open])

  if (!mounted || typeof document === 'undefined') return null

  // Portalled to <body>: a Dialog nested inside another Dialog's DialogContent
  // (e.g. the media picker opened from a field inside an "Edit settings" modal)
  // would otherwise render inside it in the DOM — and since DialogContent
  // animates with a CSS `transform` (scale), that transform makes it the
  // containing block for this dialog's `fixed` positioning, trapping it inside
  // the outer modal's bounds instead of covering the viewport. Portalling to
  // `document.body` sidesteps that regardless of where a Dialog is mounted.
  return createPortal(
    <div
      data-state={visible ? 'open' : 'closed'}
      className="group/dialog fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 group-data-[state=closed]/dialog:opacity-0 group-data-[state=open]/dialog:opacity-100"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>,
    document.body
  )
}

type DialogSlot = 'plain' | 'fixed' | 'body'

/**
 * Where a DialogHeader / DialogFooter is being rendered, so it can style itself:
 * `fixed` = pinned outside the scroll area, `body` = inside it (a footer nested in
 * a <form> sticks to the bottom instead), `plain` = used outside DialogContent.
 */
const DialogSlotContext = React.createContext<DialogSlot>('plain')

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Opt out of the automatic layout below, for dialogs that lay out their own
   * header / scroll region / footer (and keep the classic `p-6` padding).
   */
  bare?: boolean
}

/**
 * Capped at 85vh. A direct-child DialogHeader and DialogFooter stay pinned; everything
 * else scrolls in between. A DialogFooter nested inside the body (e.g. inside a
 * <form>) sticks to the bottom of the scroll area instead.
 */
const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, bare, ...props }, ref) => {
    const header: React.ReactNode[] = []
    const footer: React.ReactNode[] = []
    const body: React.ReactNode[] = []
    if (!bare) {
      for (const child of React.Children.toArray(children)) {
        if (React.isValidElement(child) && child.type === DialogHeader) header.push(child)
        else if (React.isValidElement(child) && child.type === DialogFooter) footer.push(child)
        else body.push(child)
      }
    }

    return (
      <div
        ref={ref}
        className={cn(
          'relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl',
          bare ? 'p-6' : 'flex max-h-[85vh] flex-col overflow-hidden',
          'transition-all duration-200 ease-out',
          'group-data-[state=closed]/dialog:scale-95 group-data-[state=closed]/dialog:opacity-0',
          'group-data-[state=open]/dialog:scale-100 group-data-[state=open]/dialog:opacity-100',
          className
        )}
        {...props}
      >
        {bare ? (
          children
        ) : (
          <>
            {header.length > 0 ? (
              <DialogSlotContext.Provider value="fixed">{header}</DialogSlotContext.Provider>
            ) : null}
            <DialogSlotContext.Provider value="body">
              <div
                className={cn(
                  'min-h-0 flex-1 overflow-y-auto px-6',
                  header.length > 0 ? 'pb-6' : 'py-6',
                  // A footer nested in the body sticks to its bottom edge, so it
                  // supplies the bottom spacing itself.
                  'has-[[data-dialog-footer]]:pb-0'
                )}
              >
                {body}
              </div>
            </DialogSlotContext.Provider>
            {footer.length > 0 ? (
              <DialogSlotContext.Provider value="fixed">{footer}</DialogSlotContext.Provider>
            ) : null}
          </>
        )}
      </div>
    )
  }
)
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const slot = React.useContext(DialogSlotContext)
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5',
        slot === 'fixed' ? 'shrink-0 px-6 pb-4 pt-6' : 'mb-4',
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const slot = React.useContext(DialogSlotContext)
  return (
    <div
      data-dialog-footer={slot === 'body' ? '' : undefined}
      className={cn(
        'flex items-center justify-end gap-2',
        slot === 'fixed' && 'shrink-0 border-t px-6 py-4',
        slot === 'body' && 'sticky bottom-0 z-10 -mx-6 mt-6 border-t bg-card px-6 py-4',
        slot === 'plain' && 'mt-6',
        className
      )}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
