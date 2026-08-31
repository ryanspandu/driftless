/**
 * The built-in screens a builder page can stand in for, in one place.
 *
 * A "role" is a `web_settings` pointer `(section, key)` holding a page id: set it
 * to make a published builder page render in place of the hard-coded screen at a
 * fixed route (`/`, `/login`, a 404…). Empty/missing/draft/deleted → the row is
 * absent → the built-in screen shows (see `AuthPageOverrideService.resolve`).
 *
 * This is the SERVER source of truth. The client keeps a presentation mirror in
 * `inertia/types/api.ts` (`PAGE_ROLE_SLOTS`); `tests/unit/page_role_slots.spec.ts`
 * asserts the two `(section, key)` sets never drift. Both are plain data with no
 * runtime deps because server (`#…`) and client (Vite `~/`) cannot share a module.
 */
export type OverrideSlot =
  | 'home'
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'resetPassword'
  | 'notFound'
  | 'serverError'

export interface PageRoleSlot {
  slot: OverrideSlot
  section: string
  key: string
}

export const PAGE_ROLE_SLOTS: readonly PageRoleSlot[] = [
  { slot: 'home', section: 'home_page', key: 'front_page_id' },
  { slot: 'login', section: 'auth_pages', key: 'login_page_id' },
  { slot: 'register', section: 'auth_pages', key: 'register_page_id' },
  { slot: 'forgotPassword', section: 'auth_pages', key: 'forgot_password_page_id' },
  { slot: 'resetPassword', section: 'auth_pages', key: 'reset_password_page_id' },
  { slot: 'notFound', section: 'error_pages', key: 'not_found_page_id' },
  { slot: 'serverError', section: 'error_pages', key: 'server_error_page_id' },
]

/** `slot -> { section, key }`, built from the list so the two never diverge. */
export const PAGE_ROLE_SLOTS_BY_SLOT: Record<OverrideSlot, { section: string; key: string }> =
  Object.fromEntries(
    PAGE_ROLE_SLOTS.map((s) => [s.slot, { section: s.section, key: s.key }])
  ) as Record<OverrideSlot, { section: string; key: string }>
