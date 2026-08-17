import Page from '#models/page'
import { WebSettingsService } from '#services/settings_service'

const webSettingsService = new WebSettingsService()

/**
 * A built-in screen that a builder page can stand in for.
 *
 * Auth screens and error screens share this mechanism because they share the
 * problem: both are rendered from a hard-coded component on a route that a
 * builder page can never own (`login` and `register` are reserved first
 * segments, and a 404 has no path at all by definition).
 */
export type OverrideSlot =
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'resetPassword'
  | 'notFound'
  | 'serverError'

const SLOTS: Record<OverrideSlot, { section: string; key: string }> = {
  login: { section: 'auth_pages', key: 'login_page_id' },
  register: { section: 'auth_pages', key: 'register_page_id' },
  forgotPassword: { section: 'auth_pages', key: 'forgot_password_page_id' },
  resetPassword: { section: 'auth_pages', key: 'reset_password_page_id' },
  notFound: { section: 'error_pages', key: 'not_found_page_id' },
  serverError: { section: 'error_pages', key: 'server_error_page_id' },
}

export default class AuthPageOverrideService {
  /**
   * The page standing in for this screen, or `null` to use the built-in one.
   *
   * Every unhealthy state resolves to `null`: no setting, a page that was
   * deleted, or one that has been moved back to Draft. That fail-open is the
   * whole safety story here — a login screen that throws locks an operator out
   * of their own site, and no amount of "correct" error reporting is worth
   * that. A stale id is a page that quietly reverts to the default, which they
   * can see and fix.
   *
   * `kind: 'CODE'` is accepted rather than rejected. `PageRenderer` already
   * renders both kinds, so a developer who wants a hand-written login screen
   * can have one; a missing component file renders CodePageView's "component
   * not found" panel rather than crashing. The admin picker only offers
   * BUILDER pages, which is the intended path, but the service does not police
   * a value set by other means.
   */
  async resolve(slot: OverrideSlot): Promise<Page | null> {
    const target = SLOTS[slot]
    const sections = await webSettingsService.getMergedSections()
    const id = sections[target.section]?.[target.key]?.trim()
    if (!id) return null

    const page = await Page.query()
      .where('id', id)
      .where('status', 'PUBLISHED')
      .whereNull('deleted_at')
      .first()

    return page ?? null
  }
}
