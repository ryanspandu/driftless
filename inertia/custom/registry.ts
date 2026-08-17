import type { ComponentType } from 'react'
import type { CodePageProps } from '~/custom/types'

/**
 * The hand-written pages this build knows about.
 *
 * Its own module because two very different callers need it: the public
 * renderer, which resolves a slug to a component, and the **admin builder**,
 * which only needs to ask whether a page declares an editable region. Importing
 * the renderer into the admin bundle to answer that would drag the public page
 * components along with it.
 *
 * `eager: true` for the same reason the module block registry is: the public
 * path is server-rendered, and a lazy glob hands back a promise with nothing to
 * await inside `renderToString`.
 */
export interface CustomPageModule {
  default: ComponentType<CodePageProps>
  /**
   * Opt in to a builder-editable region.
   *
   * Set by a page that renders `<BuilderRegion />`, and read by the admin so it
   * knows to open the page builder instead of the "this page is built in code"
   * notice. A flag rather than inspection: whether a component renders a region
   * is only knowable by rendering it, and the admin would have to guess.
   */
  editableRegion?: boolean
}

const CUSTOM_PAGES = import.meta.glob<CustomPageModule>('./pages/*.tsx', { eager: true })

const keyFor = (slug: string) => `./pages/${slug}.tsx`

export function getCustomPage(slug: string): ComponentType<CodePageProps> | null {
  return CUSTOM_PAGES[keyFor(slug)]?.default ?? null
}

/** Does this page render a builder-editable region? */
export function customPageHasRegion(slug: string): boolean {
  return CUSTOM_PAGES[keyFor(slug)]?.editableRegion === true
}

/** Every slug in this build, sorted — shown when a lookup misses. */
export function customPageSlugs(): string[] {
  return Object.keys(CUSTOM_PAGES)
    .map((key) => key.replace('./pages/', '').replace('.tsx', ''))
    .sort()
}
