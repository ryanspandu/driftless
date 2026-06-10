import { type ReactElement, type ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { toast, Toaster } from 'sonner'
import { useEffect } from 'react'
import { type Data } from '@generated/data'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { PublicWebMeta } from '~/components/public-web-meta'
import { AnalyticsScripts } from '~/components/analytics-scripts'

export default function PublicLayout({
  children,
}: {
  children: ReactElement<Data.SharedProps> | ReactNode
}) {
  const { url, props } = usePage<Data.SharedProps>()

  useEffect(() => {
    toast.dismiss()
  }, [url])

  useEffect(() => {
    if (props.flash?.error) toast.error(props.flash.error)
    if (props.flash?.success) toast.success(props.flash.success)
  })

  return (
    <div className="cms-shell flex min-h-screen flex-col bg-background">
      <PublicWebMeta />
      <AnalyticsScripts />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Driftless
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {props.user ? (
            <Link href="/admin/dashboard" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Admin
            </Link>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                Log in
              </Link>
              <Link href="/register" className={cn(buttonVariants({ size: 'sm' }))}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <Toaster position="top-center" richColors />
    </div>
  )
}
