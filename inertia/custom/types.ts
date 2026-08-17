import type { MetaTag } from '~/components/public-page-head'
import type { CodeSnippet } from '~/puck/custom-code'
import type { CmsRecord } from '~/puck/collection-list'

/**
 * What a hand-written page component receives.
 *
 * The contract is deliberately narrow. A code page owns its own markup — it does
 * not get the Puck config, the block registry, or the collection/block data
 * resolvers, because it is not composing blocks. What it does get is everything
 * the CMS knows about the page: who it is, what the operator set in Page
 * Settings, and the site chrome it can opt into.
 */
export interface CodePageProps {
  /** Title from the page record (SEO title overrides it in the `<head>`). */
  title: string
  /** Public path, without a leading slash. */
  path: string
  /** Page Settings → SEO. Already emitted in `<head>`; here for page-level use. */
  seo: Record<string, unknown>
  /** Site-wide `<meta>` tags from Website Settings. */
  globalMeta?: MetaTag[]
  /**
   * Header / footer template documents, resolved exactly as for a builder page.
   *
   * Passed rather than rendered so the page decides: wrap yourself in
   * `<SiteChrome>` to sit inside the real site header and footer, or ignore
   * these entirely and own the full viewport.
   */
  header?: Record<string, unknown>
  footer?: Record<string, unknown>
  /** Route params when this page is rendered as a template for a record. */
  bindings?: Record<string, string>
  /** True when rendered through the admin preview route. */
  preview?: boolean
}

/**
 * What the server hands the wrapper page.
 *
 * A superset of `CodePageProps`: the extra fields are plumbing for the frame
 * and the editable region, and are deliberately **not** forwarded to your
 * component — a page should not have to know about block-data resolution to
 * render a heading.
 */
export interface CodePageEnvelope extends CodePageProps {
  /** Slug of the component under `inertia/custom/pages/`. */
  component: string
  /** The `<BuilderRegion />` document — the page's own `content` column. */
  content?: Record<string, unknown>
  /** Site-wide custom code from Website Settings. */
  globalCode?: CodeSnippet[]
  /** Server-resolved data for blocks inside the region. */
  templates?: Record<string, Record<string, unknown>>
  collections?: Record<string, CmsRecord[]>
  blockData?: Record<string, unknown>
}
