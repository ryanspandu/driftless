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

/**
 * Custom-template "kits" — the folder counterpart to a single-file page. A page
 * points at one with `component = "kit:<folder>"`, resolved to that folder's
 * `index.tsx`. Same eager glob, same reason (SSR `renderToString` can't await).
 * See `inertia/custom/kits/README.md`.
 */
const CUSTOM_KITS = import.meta.glob<CustomPageModule>('./kits/*/index.tsx', { eager: true })

/**
 * File-pages — standalone routes that live inside a kit (`pages/*.tsx`), with no
 * database row. Pointed at by `kitpage:<kit>/<file>`. Same eager glob + reason.
 */
const CUSTOM_KIT_PAGES = import.meta.glob<CustomPageModule>('./kits/*/pages/*.tsx', { eager: true })

const KIT_PREFIX = 'kit:'
const KITPAGE_PREFIX = 'kitpage:'

/**
 * Resolve a `page.component` pointer to its module:
 *   `kit:<id>`            → the kit's index.tsx (a DB page's template)
 *   `kitpage:<kit>/<file>` → a file-page inside a kit
 *   `<slug>`             → a single-file code page under `./pages/`
 */
function moduleFor(pointer: string): CustomPageModule | undefined {
  if (pointer.startsWith(KITPAGE_PREFIX)) {
    const rest = pointer.slice(KITPAGE_PREFIX.length) // "<kit>/<file>"
    const slash = rest.indexOf('/')
    if (slash < 0) return undefined
    const kit = rest.slice(0, slash)
    const file = rest.slice(slash + 1)
    return CUSTOM_KIT_PAGES[`./kits/${kit}/pages/${file}.tsx`]
  }
  if (pointer.startsWith(KIT_PREFIX)) {
    return CUSTOM_KITS[`./kits/${pointer.slice(KIT_PREFIX.length)}/index.tsx`]
  }
  return CUSTOM_PAGES[`./pages/${pointer}.tsx`]
}

export function getCustomPage(pointer: string): ComponentType<CodePageProps> | null {
  return moduleFor(pointer)?.default ?? null
}

/** Does this page/kit render a builder-editable region? */
export function customPageHasRegion(pointer: string): boolean {
  return moduleFor(pointer)?.editableRegion === true
}

/** Every page slug and `kit:<id>` in this build, sorted — shown when a lookup misses. */
export function customPageSlugs(): string[] {
  const pages = Object.keys(CUSTOM_PAGES).map((key) =>
    key.replace('./pages/', '').replace('.tsx', '')
  )
  const kits = Object.keys(CUSTOM_KITS).map(
    (key) => `${KIT_PREFIX}${key.replace('./kits/', '').replace('/index.tsx', '')}`
  )
  return [...pages, ...kits].sort()
}
