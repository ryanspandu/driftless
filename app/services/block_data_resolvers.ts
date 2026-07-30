/**
 * Server-side data resolution for Puck blocks.
 *
 * `page_data_resolver.ts` walks a Puck document looking for one hard-coded
 * block type (`CollectionList`). That was fine while there was exactly one
 * data-bound block; it does not extend. This registry generalises it: a block
 * type registers how to spot its own references and how to fetch them, and the
 * walker dispatches.
 *
 * Core does not import module code (`docs/ai/modules.md`), so a module
 * registers its resolvers from its `boot(app)` hook rather than being listed
 * here.
 */

/** One data reference found in a block's props. */
export interface BlockDataRef {
  /**
   * Cache key, and the key the client looks the data up under. It must match
   * exactly what the block component computes at render time.
   */
  key: string
}

/**
 * What the current URL bound this render to.
 *
 * Lets one builder page act as a template for many records: a block can leave
 * its own binding blank and inherit the route's, so a single designed page
 * serves every product rather than needing one page per product.
 */
export interface BlockRenderContext {
  /** Route parameters, e.g. `{ slug: 'blue-widget' }`. Empty for an ordinary page. */
  params?: Record<string, string>
  /**
   * The request's query string and cookies, forwarded verbatim.
   *
   * Core does not interpret either — it only carries them, so a module's
   * resolver can read whatever it put there. The e-commerce module reads its
   * currency cookie this way, which lets a product block render server-side in
   * the shopper's currency without core knowing what a currency is.
   */
  query?: Record<string, string>
  cookies?: Record<string, string>
}

export interface BlockResolver<TRef extends BlockDataRef = BlockDataRef> {
  /**
   * Inspect one block's props. Return a reference to fetch, or null when this
   * block instance is not bound to anything.
   *
   * `context` carries the route's own bindings, so a block with no explicit
   * target can fall back to whatever the URL named.
   */
  collect(props: Record<string, unknown>, context: BlockRenderContext): TRef | null

  /** Fetch the data for a batch of references. Keys map 1:1 onto `refs`. */
  resolve(refs: TRef[]): Promise<Record<string, unknown>>

  /**
   * Data that must never be baked into an SSG snapshot.
   *
   * Prices and stock go stale the moment they are cached, and a static page
   * promising "in stock" for something sold out an hour ago is worse than one
   * that says nothing. Volatile resolvers are skipped for SSG pages; the block
   * hydrates them on the client instead.
   */
  volatile?: boolean
}

const resolvers = new Map<string, BlockResolver>()

export function registerBlockResolver(blockType: string, resolver: BlockResolver): void {
  if (resolvers.has(blockType)) {
    throw new Error(`A data resolver for block "${blockType}" is already registered`)
  }
  resolvers.set(blockType, resolver)
}

export function getBlockResolver(blockType: string): BlockResolver | undefined {
  return resolvers.get(blockType)
}

export function registeredBlockTypes(): string[] {
  return [...resolvers.keys()].sort()
}

/** Test seam. */
export function clearBlockResolvers(): void {
  resolvers.clear()
}

/** Recursively collect refs from a Puck node tree. */
function walk(
  node: unknown,
  acc: Map<string, { resolver: BlockResolver; ref: BlockDataRef; type: string }>,
  includeVolatile: boolean,
  context: BlockRenderContext
): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, acc, includeVolatile, context)
    return
  }

  if (!node || typeof node !== 'object') return

  const block = node as { type?: string; props?: Record<string, unknown> }

  if (block.type && block.props) {
    const resolver = resolvers.get(block.type)
    if (resolver && (includeVolatile || !resolver.volatile)) {
      const ref = resolver.collect(block.props, context)
      // Deduplicated by key: the same product list appearing twice on a page
      // is fetched once.
      if (ref && !acc.has(ref.key)) {
        acc.set(ref.key, { resolver, ref, type: block.type })
      }
    }
  }

  /**
   * Recurse into **every** value, not just `props`.
   *
   * Puck's `zones` is a plain object keyed by zone id (`{ 'root:main': [...] }`)
   * with no `type` or `props` of its own, so a walk that only descends through
   * `props` never reaches the blocks inside it — they would silently miss out
   * on their server-side data and fall back to a client fetch.
   */
  for (const value of Object.values(node as Record<string, unknown>)) {
    walk(value, acc, includeVolatile, context)
  }
}

/**
 * Pre-fetch everything the registered blocks across these docs are bound to.
 *
 * @param includeVolatile false for SSG, where price and stock must not be baked
 *   into the snapshot.
 */
export async function resolveBlockData(
  docs: Array<Record<string, unknown> | undefined | null>,
  options: { includeVolatile?: boolean; context?: BlockRenderContext } = {}
): Promise<Record<string, unknown>> {
  if (resolvers.size === 0) return {}

  const includeVolatile = options.includeVolatile ?? true
  const context: BlockRenderContext = options.context ?? {}
  const found = new Map<string, { resolver: BlockResolver; ref: BlockDataRef; type: string }>()

  for (const doc of docs) {
    if (!doc) continue
    walk((doc as { content?: unknown }).content, found, includeVolatile, context)
    walk((doc as { zones?: unknown }).zones, found, includeVolatile, context)
  }

  if (found.size === 0) return {}

  // Group by resolver so each fetches its whole batch in one go.
  const batches = new Map<BlockResolver, BlockDataRef[]>()
  for (const { resolver, ref } of found.values()) {
    const list = batches.get(resolver) ?? []
    list.push(ref)
    batches.set(resolver, list)
  }

  const out: Record<string, unknown> = {}
  for (const [resolver, refs] of batches) {
    try {
      Object.assign(out, await resolver.resolve(refs))
    } catch (error) {
      /**
       * One failing resolver must not take the whole page down. A product strip
       * that cannot load should render empty, not 500 the shop's home page.
       */
      console.error('[blocks] resolver failed', error)
      for (const ref of refs) out[ref.key] = null
    }
  }

  return out
}
