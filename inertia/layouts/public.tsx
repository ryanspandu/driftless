import { type ReactElement, type ReactNode, useEffect, useState } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { toast, Toaster } from 'sonner'
import { Layers } from 'lucide-react'
import { type Data } from '@generated/data'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { PublicWebMeta } from '~/components/public-web-meta'
import { AnalyticsScripts } from '~/components/analytics-scripts'
import { ScrollToTop } from '~/components/scroll-to-top'

const NAV_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#why', label: 'Why us' },
  { href: '/#testimonials', label: 'Stories' },
]

export default function PublicLayout({
  children,
}: {
  children: ReactElement<Data.SharedProps> | ReactNode
}) {
  const { url, props } = usePage<Data.SharedProps>()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    toast.dismiss()
  }, [url])

  useEffect(() => {
    if (props.flash?.error) toast.error(props.flash.error)
    if (props.flash?.success) toast.success(props.flash.success)
  })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="cms-shell flex min-h-screen flex-col bg-background">
      <PublicWebMeta />
      <AnalyticsScripts />

      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-300',
          scrolled
            ? 'border-b border-border bg-background/80 shadow-sm backdrop-blur-md'
            : 'border-b border-transparent bg-transparent'
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Driftless</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {props.user ? (
              <Link href="/admin/dashboard" className={cn(buttonVariants({ size: 'sm' }))}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'hidden sm:inline-flex'
                  )}
                >
                  Log in
                </Link>
                <Link href="/register" className={cn(buttonVariants({ size: 'sm' }))}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <ScrollToTop />
      <Toaster position="top-center" richColors />
    </div>
  )
}
