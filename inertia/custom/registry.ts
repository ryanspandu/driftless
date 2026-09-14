import type { ComponentType, ReactNode } from 'react'
import type { CodePageProps, KitCapability, KitCapabilityContext } from '~/custom/types'

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
   *
   * Coarse for a router-style kit (one `index.tsx` picking between many
   * sub-templates by `path`/`record`): it's declared once for the whole
   * module, so it's wrong for every branch that doesn't actually render
   * `<BuilderRegion/>`. A kit like that should export `resolveCapability`
   * instead, which is checked first — this flag stays as the back-compat
   * fallback for every kit/page that hasn't adopted it.
   */
  editableRegion?: boolean
  /**
   * Per-Page-row capability: does the template this Page would actually
   * render have a real block region, a small set of kit-declared fields, or
   * nothing editable? Takes precedence over `editableRegion` when present.
   * See `KitCapability`/`KitCapabilityContext` (`~/custom/types`).
   */
  resolveCapability?: (ctx: KitCapabilityContext) => KitCapability
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

/**
 * Code-chrome templates — `kits/<kit>/templates/{header,footer,layout}.tsx`. A
 * page points its header/footer/layout at one (per-page) via `codetpl:<kit>/<type>`.
 * Header/footer render themselves; a layout wraps the page content via `children`.
 */
export interface CustomChromeModule {
  default: ComponentType<{ children?: ReactNode }>
}
const CUSTOM_KIT_TEMPLATES = import.meta.glob<CustomChromeModule>('./kits/*/templates/*.tsx', {
  eager: true,
})

/**
 * Code collection templates — `kits/<kit>/collection/<collectionKey>.tsx`. A
 * Collection List renders each record with one via `codetpl:<kit>/collection/<key>`.
 * The component receives a single record.
 */
export interface CustomCollectionRecord {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  data: Record<string, unknown>
}
export interface CustomCollectionModule {
  default: ComponentType<{ record: CustomCollectionRecord }>
}
const CUSTOM_KIT_COLLECTIONS = import.meta.glob<CustomCollectionModule>(
  './kits/*/collection/*.tsx',
  { eager: true }
)

/**
 * Each kit's `kit.json`, so the renderer can ask whether a kit opted into CSS
 * isolation. Eager for the same SSR reason as the component globs above.
 */
const KIT_META = import.meta.glob<{ default: { isolate?: boolean } }>('./kits/*/kit.json', {
  eager: true,
})

const KIT_PREFIX = 'kit:'
const KITPAGE_PREFIX = 'kitpage:'
const CODETPL_PREFIX = 'codetpl:'

/** The kit id inside a `kit:<id>` or `kitpage:<kit>/<file>` pointer, or null. */
export function kitIdOf(pointer: string): string | null {
  if (pointer.startsWith(KITPAGE_PREFIX)) {
    return pointer.slice(KITPAGE_PREFIX.length).split('/')[0] || null
  }
  if (pointer.startsWith(KIT_PREFIX)) return pointer.slice(KIT_PREFIX.length) || null
  return null
}

/**
 * The on-disk file a `component` pointer's markup lives in — for display only
 * (the admin's "built in code" notice and editable-region breadcrumb), never
 * for resolution. A plain page and a kit live in different folders
 * (`custom/pages/<slug>.tsx` vs `custom/kits/<id>/index.tsx`), so this can't
 * be one hardcoded template string the way both call sites used to build it.
 */
export function sourcePathOf(component: string): string {
  if (component.startsWith(KITPAGE_PREFIX)) {
    const rest = component.slice(KITPAGE_PREFIX.length) // "<kit>/<file>"
    const slash = rest.indexOf('/')
    if (slash < 0) return `inertia/custom/kits/${rest}/pages/*.tsx`
    return `inertia/custom/kits/${rest.slice(0, slash)}/pages/${rest.slice(slash + 1)}.tsx`
  }
  if (component.startsWith(KIT_PREFIX)) {
    return `inertia/custom/kits/${component.slice(KIT_PREFIX.length)}/index.tsx`
  }
  return `inertia/custom/pages/${component}.tsx`
}

/**
 * Whether a kit declared `"isolate": true` in its `kit.json`. Such a kit's CSS
 * is build-time scoped (see `scopeIsolatedKitCss` in `vite.config.ts`) and its
 * body must be wrapped in `<div class="kit-<id>">` so the `@scope` matches.
 */
export function isKitIsolated(id: string): boolean {
  return KIT_META[`./kits/${id}/kit.json`]?.default?.isolate === true
}

/** Resolve a `codetpl:<kit>/<type>` chrome pointer to its component, or null. */
export function getCodeTemplate(pointer: string): ComponentType<{ children?: ReactNode }> | null {
  if (!pointer.startsWith(CODETPL_PREFIX)) return null
  const rest = pointer.slice(CODETPL_PREFIX.length) // "<kit>/<type>"
  const slash = rest.indexOf('/')
  if (slash < 0) return null
  return (
    CUSTOM_KIT_TEMPLATES[`./kits/${rest.slice(0, slash)}/templates/${rest.slice(slash + 1)}.tsx`]
      ?.default ?? null
  )
}

/** Resolve a `codetpl:<kit>/collection/<key>` pointer to its record component, or null. */
export function getCollectionTemplate(
  pointer: string
): ComponentType<{ record: CustomCollectionRecord }> | null {
  const m = pointer.match(/^codetpl:([^/]+)\/collection\/(.+)$/)
  if (!m) return null
  return CUSTOM_KIT_COLLECTIONS[`./kits/${m[1]}/collection/${m[2]}.tsx`]?.default ?? null
}

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

/**
 * Resolve what the admin builder should show for this specific Page row:
 * a real block region, a kit-declared set of simple fields, or nothing.
 *
 * A throwing `resolveCapability` fails open to `{kind:'none'}` — same
 * fail-open posture as `AuthPageOverrideService.resolve` — so a bug in one
 * kit's resolver can't crash the whole Pages admin.
 */
export function resolveCustomPageCapability(
  pointer: string,
  ctx: KitCapabilityContext
): KitCapability {
  const mod = moduleFor(pointer)
  if (!mod) return { kind: 'none' }
  if (typeof mod.resolveCapability === 'function') {
    try {
      return mod.resolveCapability(ctx)
    } catch {
      return { kind: 'none' }
    }
  }
  return mod.editableRegion === true ? { kind: 'region' } : { kind: 'none' }
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
