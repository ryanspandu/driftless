import TemplatesService from '#services/templates_service'
import { WebSettingsService } from '#services/settings_service'
import { resolvePageCollections } from '#services/page_data_resolver'
import { resolveBlockData } from '#services/block_data_resolvers'

/**
 * The site's default header/footer chrome, resolved for a page that is NOT a
 * builder page.
 *
 * Builder and code pages get their header/footer through `PageRenderer`; a
 * hand-written Inertia page (the storefront's cart/checkout/account screens) has
 * no such path, so it would otherwise render with no site chrome at all. This
 * resolves the same site-default `HEADER`/`FOOTER` templates the builder path
 * uses — plus their referenced templates, bound collections, block data, and the
 * global code/meta — into props a page can hand to `PublicPageFrame` +
 * `SiteChrome`.
 *
 * It resolves the *defaults* only (no per-page header/footer override, no
 * layout), because these pages are not rows in `pages` and have nothing to
 * override with.
 */
export interface SiteChromeProps {
  header?: Record<string, unknown>
  footer?: Record<string, unknown>
  templates: Record<string, Record<string, unknown>>
  collections: Record<string, unknown[]>
  blockData: Record<string, unknown>
  globalCode: Awaited<ReturnType<WebSettingsService['getGlobalCode']>>
  globalMeta: Awaited<ReturnType<WebSettingsService['getSiteMetaTags']>>
}

export default class SiteChromeService {
  private templates = new TemplatesService()
  private webSettings = new WebSettingsService()

  async resolve(): Promise<SiteChromeProps> {
    const [headerTemplate, footerTemplate] = await Promise.all([
      this.templates.getDefault('HEADER'),
      this.templates.getDefault('FOOTER'),
    ])
    const header = headerTemplate?.content ?? undefined
    const footer = footerTemplate?.content ?? undefined

    // Templates referenced from inside the header/footer documents.
    const templates = await this.templates.resolveRefs([header, footer])
    const docs = [header, footer, ...Object.values(templates)]

    // `includeVolatile: true` — these pages are never snapshotted, so live data
    // (a basket count in the header, say) is safe to resolve here.
    const [collections, blockData, globalCode, globalMeta] = await Promise.all([
      resolvePageCollections(docs),
      resolveBlockData(docs, { includeVolatile: true, context: {} }),
      this.webSettings.getGlobalCode(),
      this.webSettings.getSiteMetaTags(),
    ])

    return { header, footer, templates, collections, blockData, globalCode, globalMeta }
  }
}
