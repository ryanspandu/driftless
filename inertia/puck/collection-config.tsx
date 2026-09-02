import type { Config } from '@measured/puck'
import { puckConfig } from '~/puck/config'

/**
 * The block set for designing a COLLECTION template — one item card, repeated
 * by a CollectionList once per record.
 *
 * It is the page block set minus two blocks that make no sense inside a card:
 *
 * - `CollectionList`: a list inside every item of a list would fetch the
 *   collection N times per page, and the Settings tab's "Get text from" scope
 *   would become ambiguous (the inner list's collection or the outer one's?).
 * - `PageOutlet`: the slot a LAYOUT template leaves for the page body. A card
 *   has no page body to slot in.
 *
 * Everything else — including field binding via the Settings tab, which the
 * builder scopes to the template's collection — works exactly as on a page.
 */
const EXCLUDED = new Set(['CollectionList', 'PageOutlet'])

function withoutExcluded(config: Config): Config {
  const components = Object.fromEntries(
    Object.entries(config.components).filter(([name]) => !EXCLUDED.has(name))
  ) as Config['components']

  const categories = config.categories
    ? (Object.fromEntries(
        Object.entries(config.categories).flatMap(([key, category]) => {
          const kept = (category.components ?? []).filter((name) => !EXCLUDED.has(name))
          // Drop a category left empty (CMS held only CollectionList) rather
          // than show a heading with nothing under it.
          return kept.length ? [[key, { ...category, components: kept }]] : []
        })
      ) as Config['categories'])
    : undefined

  return { ...config, components, categories }
}

export const collectionPuckConfig: Config = withoutExcluded(puckConfig)
