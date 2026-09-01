import { useQuery } from '@tanstack/react-query'
import { cn } from '~/lib/utils'
import { apiFetch } from '~/lib/api-client'
import { DropdownMenuItem, DropdownMenuSeparator } from '~/components/ui/dropdown_menu'
import { useModulesList } from '~/hooks/api/use-modules'
import type { ModulePageRolesProps } from '~/lib/module-page-roles'
import { ecommerceKeys, useUpdateStoreSettings, type StoreSettingsDto } from './admin/_api'

type SlotKey =
  | 'cartPageId'
  | 'checkoutPageId'
  | 'orderPageId'
  | 'accountPageId'
  | 'loginPageId'
  | 'registerPageId'

const SLOTS: { key: SlotKey; label: string }[] = [
  { key: 'cartPageId', label: 'Basket' },
  { key: 'checkoutPageId', label: 'Checkout' },
  { key: 'orderPageId', label: 'Order status' },
  { key: 'accountPageId', label: 'Account' },
  { key: 'loginPageId', label: 'Sign in' },
  { key: 'registerPageId', label: 'Sign up' },
]

/**
 * The storefront screens in the "Use as page" menu.
 *
 * Same idea as core's slots, but these pointers live on the e-commerce store
 * settings row rather than `web_settings`, so the module contributes them here
 * instead of listing them in `PAGE_ROLE_SLOTS`. The selected slot is shown with
 * the same brand highlight as the core rows; clicking it again resets that
 * screen to its built-in default. Renders nothing unless the module is enabled.
 */
export default function EcommercePageRoles({ page }: ModulePageRolesProps) {
  const modules = useModulesList()
  const enabled = modules.data?.some((mod) => mod.name === 'ecommerce' && mod.enabled) ?? false

  // Same key as `useStoreSettings`, so the mutation below invalidates both this
  // and the Storefront settings panel — but gated on the module being enabled so
  // a store-less install never calls the module-only endpoint (a 404).
  const settings = useQuery({
    queryKey: ecommerceKeys.settings,
    queryFn: () => apiFetch<StoreSettingsDto>('/api/admin/ecommerce/settings'),
    enabled,
    staleTime: 30_000,
  })
  const update = useUpdateStoreSettings()

  if (!enabled) return null

  const data = settings.data
  const setSlot = (key: SlotKey, value: string | null) =>
    update.mutate({ [key]: value } as Partial<StoreSettingsDto>)

  return (
    <>
      <DropdownMenuSeparator />
      {/* A plain label, not `DropdownMenuLabel`: that maps to Base UI's
          `Menu.GroupLabel`, which throws unless wrapped in a `Menu.Group`. */}
      <div className="px-2 py-1.5 text-xs text-muted-foreground">Storefront</div>
      {SLOTS.map((slot) => {
        const current = data?.[slot.key] === page.id
        return (
          <DropdownMenuItem
            key={slot.key}
            className={cn(
              current &&
                'bg-primary/10 font-medium text-primary focus:bg-primary/15 focus:text-primary'
            )}
            onClick={() => setSlot(slot.key, current ? null : page.id)}
          >
            {slot.label}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
