import { createContext, useContext } from 'react'

/**
 * The channel a server-resolved block gets its data through.
 *
 * Generic on purpose. Core's `PageRenderer` resolves block data through a
 * registry that modules add to — it never knows what a "product" is — so the
 * contexts that carry the result belong to core too. They lived in the
 * e-commerce module for a while because it was the first thing to use them,
 * which meant core imported a module by name to render any page at all.
 */

/**
 * Data resolved server-side, keyed by the same strings the server used.
 *
 * Empty in the builder preview and on CSR pages — there the blocks fetch.
 */
export const BlockDataContext = createContext<Record<string, unknown>>({})

/**
 * What the current URL bound this render to, e.g. `{ slug: 'blue-widget' }`.
 *
 * Lets a block leave its own target blank and inherit the route's, which is
 * what makes one builder page serve every item. Mirrors `BlockRenderContext`
 * on the server — the two must agree on the parameter names.
 */
export const BlockBindingsContext = createContext<Record<string, string>>({})

/** The route's binding for `name`, or empty when this is an ordinary page. */
export function useBinding(name: string): string {
  return useContext(BlockBindingsContext)[name] ?? ''
}
