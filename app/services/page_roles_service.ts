import CmsCollection from '#models/cms_collection'
import { MODULES } from '#modules/registry'
import ModulesService from '#services/modules_service'
import { PAGE_ROLE_SLOTS, type OverrideSlot, type PageRoleClaim } from '#services/page_role_slots'
import ContentPathsService from '#services/content_paths_service'
import { WebSettingsService } from '#services/settings_service'

const webSettingsService = new WebSettingsService()
const contentPaths = new ContentPathsService()
const modulesService = new ModulesService()

/**
 * The fixed public URL of each core role, or `null` when the screen has none
 * (per-slug templates, error screens, the token-bearing reset form). Anything
 * missing here is treated as `null`, which is the safe direction: the page's
 * own slug stays hidden rather than leaking.
 */
async function coreCanonicals(): Promise<Record<OverrideSlot, string | null>> {
  const paths = await contentPaths.get()
  return {
    home: '/',
    login: '/login',
    register: '/register',
    forgotPassword: '/forgot-password',
    resetPassword: null,
    notFound: null,
    serverError: null,
    categoryArchive: null,
    tagArchive: null,
    postsArchive: `/${paths.archive}`,
    postDetail: null,
  }
}

/**
 * Which pages currently stand in for a built-in screen, and where that screen
 * lives.
 *
 * A role page is a TEMPLATE served at a fixed URL, so its own `path` column is
 * not a real address. Two places must agree on that — the sitemap (never list
 * it) and the public catch-all (never serve it) — hence one source.
 */
export default class PageRolesService {
  /** Every claim: core role slots, collection detail templates, then module-registered ones. */
  async claims(): Promise<PageRoleClaim[]> {
    const sections = await webSettingsService.getMergedSections()
    const canonicals = await coreCanonicals()
    const claims: PageRoleClaim[] = []

    for (const { slot, section, key } of PAGE_ROLE_SLOTS) {
      const id = sections[section]?.[key]?.trim()
      if (id) claims.push({ pageId: id, canonical: canonicals[slot] })
    }

    // A collection's public detail template renders every record — no fixed URL.
    // (a failed lookup — e.g. the migration has not run yet — just claims nothing)
    const detailTemplates = await CmsCollection.query()
      .where('detail_pages_on', true)
      .whereNotNull('detail_page_id')
      .whereNull('deleted_at')
      .select('detail_page_id')
      .catch(() => [] as CmsCollection[])
    for (const c of detailTemplates) {
      if (c.detailPageId) claims.push({ pageId: c.detailPageId, canonical: null })
    }

    // Module-owned screens (e-commerce cart/checkout/…), read from the manifests by shape so
    // core never names a module. A failing or disabled module claims nothing.
    for (const mod of MODULES) {
      if (!mod.pageRoles || !(await modulesService.isEnabled(mod.name))) continue
      claims.push(...(await mod.pageRoles().catch(() => [] as PageRoleClaim[])))
    }
    return claims
  }

  /** Ids of every page holding a role — what the sitemap must not list. */
  async claimedIds(): Promise<Set<string>> {
    const claims = await this.claims()
    return new Set(claims.map((c) => c.pageId))
  }

  /**
   * `pageId → public URL` for pages that hold a role. `null` means the role has
   * no fixed URL. When a page holds several roles, the first with a URL wins
   * (core order puts the front page first).
   */
  async urlsByPage(): Promise<Map<string, string | null>> {
    const urls = new Map<string, string | null>()
    for (const { pageId, canonical } of await this.claims()) {
      const current = urls.get(pageId)
      if (current === undefined || (current === null && canonical)) urls.set(pageId, canonical)
    }
    return urls
  }

  /** `undefined` = the page holds no role; `null` = it does but has no fixed URL; else that URL. */
  async urlFor(pageId: string): Promise<string | null | undefined> {
    const urls = await this.urlsByPage()
    return urls.get(pageId)
  }
}
