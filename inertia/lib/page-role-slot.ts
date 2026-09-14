// Relative import with `.js` (repo convention for anything covered by the
// Japa `client` suite — see `inertia/lib/offline/sync-clobber.spec.ts` — the
// `~/` alias is Vite-only and hangs the Node test runner).
import { PAGE_ROLE_SLOTS } from '../types/api.js'

/**
 * The core role slot (`page_role_slots.ts` on the server, `PAGE_ROLE_SLOTS`
 * here) a Page id is currently assigned to, if any.
 *
 * Extracted from the same lookup `PageRoleBadges`
 * (`inertia/pages/admin/pages/index.tsx`) already does for the Role column —
 * this is the read-side of "Use as page". Core slots only: a
 * module-contributed slot (e.g. ecommerce's shop/cart/checkout) isn't covered
 * here, since those are discovered by shape rather than a fixed list.
 */
export function resolveCoreRoleSlot(
  pageId: string,
  sections: Record<string, Record<string, string>> | undefined
): string | null {
  return PAGE_ROLE_SLOTS.find((slot) => sections?.[slot.section]?.[slot.key] === pageId)?.slot ?? null
}
