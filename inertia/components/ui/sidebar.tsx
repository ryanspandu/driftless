import { PanelLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

export function SidebarTrigger({ className }: { className?: string }) {
  return (
    <Button variant="ghost" size="icon" className={cn('size-8', className)} type="button" aria-label="Toggle sidebar">
      <PanelLeft className="size-4" />
    </Button>
  )
}
