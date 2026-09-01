import type { ComponentType } from 'react'
import type { PageSummaryDto } from '~/types/api'

/**
 * A module's contribution to the Pages dashboard "Use as page" menu.
 *
 * Core's page-role slots (Front page, Sign in, 404…) are `web_settings` pointers
 * that core knows about — see `PAGE_ROLE_SLOTS`. A module can own its own
 * overridable screens whose pointers live in the module's own storage:
 * e-commerce keeps cart/checkout/order/account on the store settings row, not
 * `web_settings`. Rather than teach core those keys, a module drops
 * `ui/page-roles.tsx` exporting a component that renders its own menu items and
 * reads/writes its own settings. Core discovers it by shape, never by name — the
 * same rule as `ui/puck/blocks.tsx` (see `module-blocks.ts`).
 *
 * The component is rendered inside the open submenu for one page, only when that
 * page is an eligible (published, builder) override target. It must render
 * nothing when its module is disabled or contributes no slots.
 */
export interface ModulePageRolesProps {
  /** The page whose row menu is open — the candidate each slot would point at. */
  page: PageSummaryDto
}

export type ModulePageRoles = ComponentType<ModulePageRolesProps>

/**
 * Eager, like the block glob: the menu renders synchronously when a row opens,
 * so there is nothing to defer. Vite resolves this at build time.
 */
const contributions = import.meta.glob<{ default: ModulePageRoles }>(
  '../../modules/*/ui/page-roles.tsx',
  { eager: true }
)

/** Every module's "Use as page" contribution, discovered by shape. */
export const modulePageRoles: ModulePageRoles[] = Object.values(contributions)
  .map((mod) => mod?.default)
  .filter((component): component is ModulePageRoles => Boolean(component))
