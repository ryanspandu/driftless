import { Link, router, usePage } from '@inertiajs/react'
import { useEffect, useState } from 'react'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'
import { cn } from '~/lib/utils'
import { ThemeToggle } from '~/components/admin/theme-toggle'
import type { Data } from '@generated/data'

type GuestGateState = 'checking' | 'ready' | 'redirecting'

function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { props } = usePage<Data.SharedProps>()
  const [state, setState] = useState<GuestGateState>('checking')

  useEffect(() => {
    queueMicrotask(() => {
      setState(props.user ? 'redirecting' : 'ready')
    })
  }, [props.user])

  useEffect(() => {
    if (state === 'redirecting') {
      router.visit('/admin/dashboard')
    }
  }, [state])

  if (state !== 'ready') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ring/8">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}

const FALLBACK_AUTH_LOGO = '/logo-text.svg'

function AuthBackground({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 size-full object-cover object-center"
    />
  )
}

/**
 * Default auth panel backdrop: a brand-toned gradient derived from the primary
 * color, so the panel matches the app's indigo tone instead of a stock photo.
 * A custom image (settings → authBackgroundUrl) overrides this when present.
 */
function AuthGradient() {
  return (
    <div
      className="absolute inset-0 size-full"
      style={{
        backgroundColor: 'var(--primary)',
        backgroundImage: [
          'radial-gradient(120% 90% at 15% 12%, color-mix(in oklch, var(--primary) 70%, white) 0%, transparent 55%)',
          'radial-gradient(130% 120% at 85% 100%, color-mix(in oklch, var(--primary) 75%, black) 0%, transparent 60%)',
          'linear-gradient(155deg, color-mix(in oklch, var(--primary) 88%, black) 0%, var(--primary) 55%, color-mix(in oklch, var(--primary) 80%, #6d5cff) 100%)',
        ].join(', '),
      }}
    />
  )
}

function AuthPanelLogo({ src, title }: { src: string; title: string }) {
  return (
    <img
      src={src}
      alt={title}
      className={cn('h-10 w-auto max-w-[220px] sm:h-11')}
      decoding="async"
    />
  )
}

export function AuthShell({
  children,
  redirectIfAuthenticated = false,
}: {
  children: React.ReactNode
  redirectIfAuthenticated?: boolean
}) {
  const authCfg = useAuthPublicConfig()
  const web = authCfg.data?.web
  const customBg = web?.authBackgroundUrl?.trim()
  const logoSrc = web?.authLogoUrl?.trim() || FALLBACK_AUTH_LOGO
  const siteTitle = web?.siteTitle?.trim() || 'Driftless'

  const layout = (
    <div className="cms-shell relative flex min-h-screen items-center justify-center bg-card p-4 sm:p-6 md:p-8">
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-[56rem] overflow-hidden rounded-2xl border border-border bg-card">
        <aside className="relative hidden min-h-[32rem] w-[44%] shrink-0 flex-col justify-between overflow-hidden p-10 text-white lg:flex">
          {customBg ? <AuthBackground src={customBg} /> : <AuthGradient />}
          <div className="relative z-10">
            <AuthPanelLogo src={logoSrc} title={siteTitle} />
          </div>
          <div className="relative z-10 space-y-2">
            <p className="text-sm font-normal text-white/85">You can easily</p>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl">
              Get access to your hub for content, clarity, and control.
            </h2>
          </div>
        </aside>
        <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 sm:py-12 md:px-14">
          <div className="mx-auto w-full max-w-md space-y-8">
            <div className="lg:hidden">
              <Link href="/">
                <AuthPanelLogo src={logoSrc} title={siteTitle} />
              </Link>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  if (redirectIfAuthenticated) {
    return <RedirectIfAuthenticated>{layout}</RedirectIfAuthenticated>
  }

  return layout
}
