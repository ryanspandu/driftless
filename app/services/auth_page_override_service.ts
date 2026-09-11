import Page from '#models/page'
import { WebSettingsService } from '#services/settings_service'
import { PAGE_ROLE_SLOTS_BY_SLOT, type OverrideSlot } from '#services/page_role_slots'

const webSettingsService = new WebSettingsService()

export type { OverrideSlot }

/**
 * A built-in screen that a builder page can stand in for.
 *
 * Home, auth screens and error screens share this mechanism because they share
 * the problem: all are rendered from a hard-coded component on a route that a
 * builder page can never own (`/` has no builder path, `login`/`register` are
 * reserved first segments, a 404 has no path at all). The slot → (section, key)
 * map lives in `#services/page_role_slots` so the resolver, Settings→Appearance,
 * and the Pages dashboard all read one list.
 */
const SLOTS = PAGE_ROLE_SLOTS_BY_SLOT

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
