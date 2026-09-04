import type { ComponentType } from 'react'
import type { Config } from '@measured/puck'

/**
 * Puck blocks contributed by a module.
 *
 * A module drops `ui/puck/blocks.tsx` with this as its default export and its
 * components appear in the builder. Core never names a module — the glob below
 * matches a *shape*, so installing a module is copying a folder rather than
 * editing `config.tsx`, which an installer cannot do.
 */
export interface ModulePuckBlocks {
  /** The drawer group these components appear under. */
  category: { key: string; title: string }
  components: NonNullable<Config['components']>
  /**
   * Glyph per component name, for the drawer tile / Layers row / Detail header.
   *
   * Core's icon map (`overrides.tsx`) is keyed by component name and cannot list
   * a module's blocks without naming the module, so a module ships its own
   * icons here. Omitting one is not fatal — the block falls back to the generic
   * square — but it reads as a broken tile, so contribute one per component.
   */
  icons?: Record<string, ComponentType<{ className?: string }>>
}

/**
 * Eager on purpose: the builder needs the whole component map to exist before
 * it renders its drawer, so there is nothing to defer. Vite resolves this at
 * build time, which is also why a freshly installed module needs a rebuild
 * before its blocks show up.
 */
const contributions = import.meta.glob<{ default: ModulePuckBlocks }>(
  '../../modules/*/ui/puck/blocks.tsx',
  { eager: true }
)

/**
 * Fold every module's blocks into the base config.
 *
 * Core components win on a name collision. A module cannot replace `Heading`
 * by declaring one — silently shadowing a built-in block would change what
 * every existing page renders, which is not a thing an install should be able
 * to do.
 */
export function withModuleBlocks(config: Config): Config {
  const categories = { ...(config.categories ?? {}) }
  const components = { ...config.components }

  for (const mod of Object.values(contributions)) {
    const blocks = mod?.default
    if (!blocks) continue

    const names: string[] = []
    for (const [name, definition] of Object.entries(blocks.components)) {
      if (name in components) continue
      components[name] = definition
      names.push(name)
    }

    if (names.length === 0) continue

    const existing = categories[blocks.category.key]
    categories[blocks.category.key] = {
      title: blocks.category.title,
      components: [...(existing?.components ?? []), ...names],
    }
  }

  return { ...config, categories, components }
}

/**
 * Which module owns each contributed block, keyed by component name.
 *
 * Derived from the glob path (`modules/<name>/ui/puck/blocks.tsx`), so it needs
 * no extra declaration from the module. Used by the MCP catalog emitter to tag
 * a block's provenance — an AI then knows that, say, `ProductList` comes from
 * `ecommerce` and needs that module enabled to render. Core blocks are absent
 * from this map.
 */
export function moduleBlockOwners(): Record<string, string> {
  const owners: Record<string, string> = {}
  for (const [path, mod] of Object.entries(contributions)) {
    const name = path.match(/modules\/([^/]+)\/ui\/puck\/blocks/)?.[1] ?? 'module'
    for (const component of Object.keys(mod?.default?.components ?? {})) {
      // First contributor wins, mirroring the collision rule in withModuleBlocks.
      if (!(component in owners)) owners[component] = name
    }
  }
  return owners
}

/**
 * Every module's block icons, folded into one map keyed by component name.
 *
 * Merged into core's `ICONS` in `overrides.tsx`, where core's own entries win —
 * the same rule the component merge above uses, for the same reason: a module
 * must not be able to change how a built-in block looks.
 */
export function moduleBlockIcons(): Record<string, ComponentType<{ className?: string }>> {
  const icons: Record<string, ComponentType<{ className?: string }>> = {}
  for (const mod of Object.values(contributions)) {
    Object.assign(icons, mod?.default?.icons ?? {})
  }
  return icons
}
