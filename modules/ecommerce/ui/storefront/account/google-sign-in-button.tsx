import { FcGoogle } from 'react-icons/fc'

/**
 * "Continue with Google" for the storefront's login/register screens.
 *
 * Deliberately not a reuse of `inertia/components/auth/google-sign-in-button.tsx`
 * — that one hardcodes the admin `/auth/google` route and reads the core
 * `useAuthPublicConfig()` (the admin API client, which storefront code must
 * never use). This one is a plain link to the shopper-scoped
 * `/shop/auth/google` route; `enabled` comes from `useStorefrontGoogleAuth()`.
 */
export function ShopGoogleSignInButton({ enabled }: { enabled: boolean }) {
  if (!enabled) return null

  return (
    <a
      href="/shop/auth/google"
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/60 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
    >
      <FcGoogle className="size-5 shrink-0" aria-hidden />
      Continue with Google
    </a>
  )
}

/** A plain "or" divider between the Google button and the email/password form. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or continue with email
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
