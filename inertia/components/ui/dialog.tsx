import * as React from 'react'
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

  if (!mounted) return null

  return (
    <div
      data-state={visible ? 'open' : 'closed'}
      className="group/dialog fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 group-data-[state=closed]/dialog:opacity-0 group-data-[state=open]/dialog:opacity-100"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  )
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl',
        'transition-all duration-200 ease-out',
        'group-data-[state=closed]/dialog:scale-95 group-data-[state=closed]/dialog:opacity-0',
        'group-data-[state=open]/dialog:scale-100 group-data-[state=open]/dialog:opacity-100',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
)
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 mb-4', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-lg font-semibold', className)} {...props} />
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 mt-6', className)} {...props} />
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
