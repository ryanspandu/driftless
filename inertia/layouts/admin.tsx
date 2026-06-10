import { type ReactElement, type ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { toast, Toaster } from 'sonner'
import { useEffect } from 'react'
import { type Data } from '@generated/data'
import { AppSidebar } from '~/components/admin/sidebar'
import { AdminHeader } from '~/components/admin/header'
import { TooltipProvider } from '~/components/ui/tooltip'
import { OfflineCapabilityBanner } from '~/components/admin/sync-center'
import { useRegisterOfflineHandlers } from '~/hooks/offline/use-register-handlers'

function OfflineHandlerRegistrar() {
  useRegisterOfflineHandlers()
  return null
}

export default function AdminLayout({
  children,
}: {
  children: ReactElement<Data.SharedProps> | ReactNode
}) {
  const { url, props } = usePage<Data.SharedProps>()
  const pathname = new URL(url, 'http://local').pathname

  useEffect(() => {
    if (props.flash?.error) toast.error(props.flash.error)
    if (props.flash?.success) toast.success(props.flash.success)
  }, [props.flash?.error, props.flash?.success])

  return (
    <TooltipProvider>
      <OfflineHandlerRegistrar />
      <div className="flex h-screen overflow-hidden bg-background">
        <AppSidebar pathname={pathname} />
        <div className="flex flex-1 flex-col min-w-0">
          <OfflineCapabilityBanner />
          <AdminHeader pathname={pathname} />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      <Toaster position="top-center" richColors />
    </TooltipProvider>
  )
}
