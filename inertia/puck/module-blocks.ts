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
