import { CartScreen } from '../storefront/cart'
import { CheckoutScreen } from '../storefront/checkout'
import { OrderStatusScreen } from '../storefront/order'
import { AccountScreen } from '../storefront/account/index'
import { LoginScreen } from '../storefront/account/login'
import { RegisterScreen } from '../storefront/account/register'

/**
 * Page-builder blocks for the storefront application screens.
 *
 * Each renders the very same component the fixed `/shop/*` screen uses, with
 * `embedded` set so the page — not the screen — owns the document title. This is
 * what makes "use a builder page instead of the built-in screen" work: an
 * operator drops one of these onto a page, assigns it in Storefront settings,
 * and the interactive, per-visitor UI (all client-fetched) renders inside their
 * designed page.
 *
 * In the builder canvas the screens would otherwise fire live `/api/shop/*`
 * calls and show their loading/empty state, which reads as broken. So each block
 * renders a labelled placeholder while editing and the real screen only on the
 * published page — the same idea as `ProductDetail`'s editing hint.
 */

export function ScreenPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
      <p className="text-sm font-medium">{label}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export const CartBlockView = () => <CartScreen embedded />
export const CheckoutBlockView = () => <CheckoutScreen embedded />
export const OrderStatusBlockView = () => <OrderStatusScreen embedded />
export const AccountBlockView = () => <AccountScreen embedded />
export const LoginBlockView = () => <LoginScreen embedded />
export const RegisterBlockView = () => <RegisterScreen embedded />
