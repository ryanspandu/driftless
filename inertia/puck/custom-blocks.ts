import type { ComponentType } from 'react'
import type { Config } from '@measured/puck'

/**
 * Your own React components, as builder blocks.
 *
 * The smaller of the two escape hatches: a code page takes over a whole URL,
 * this takes over one block on a page that is otherwise content. Drop a file in
 * `inertia/custom/blocks/`, default-export the definition below, and it appears
 * in the drawer under **Custom** — no registration list to edit.
 *
 * Deliberately the same shape and the same discovery rule as
 * `module-blocks.ts`, because a first-party block and a module's block are the
 * same kind of thing; only the folder differs.
 */
export interface CustomPuckBlocks {
  components: NonNullable<Config['components']>
  /**
   * Glyph per component name, for the drawer tile / Layers row / Detail header.
   * Omitting one is not fatal — the block falls back to a generic square — but
   * it reads as a broken tile.
   */
  icons?: Record<string, ComponentType<{ className?: string }>>
}

/**
 * Eager for the same reason the module registry is: the builder needs the whole
 * component map before it renders its drawer, and the public renderer needs it
 * during SSR, so there is nothing to defer. Vite resolves this at build time,
 * which is also why a newly added block file needs a rebuild to show up.
 */
const contributions = import.meta.glob<{ default: CustomPuckBlocks }>('../custom/blocks/*.tsx', {
  eager: true,
})

/**
 * Fold custom blocks into the config.
 *
 * Existing components win on a name collision — the same rule, for the same
 * reason, as the module fold: silently shadowing `Heading` would change what
 * every page already built renders.
 */
export function withCustomBlocks(config: Config): Config {
  const components = { ...config.components }
  const names: string[] = []

  for (const mod of Object.values(contributions)) {
    const blocks = mod?.default
    if (!blocks) continue
    for (const [name, definition] of Object.entries(blocks.components)) {
      if (name in components) continue
      components[name] = definition
      names.push(name)
    }
  }

  if (names.length === 0) return { ...config, components }

  const categories = { ...(config.categories ?? {}) }
  const existing = categories.custom
  categories.custom = {
    title: 'Custom',
    components: [...(existing?.components ?? []), ...names],
  }

  return { ...config, categories, components }
}

/** Every custom block's icon, merged into core's map in `overrides.tsx`. */
export function customBlockIcons(): Record<string, ComponentType<{ className?: string }>> {
  const icons: Record<string, ComponentType<{ className?: string }>> = {}
  for (const mod of Object.values(contributions)) {
    Object.assign(icons, mod?.default?.icons ?? {})
  }
  return icons
}
