import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Registers the server-side data resolvers owned by core's own Puck blocks.
 *
 * A provider rather than a module-scope call because `registerBlockResolver`
 * throws on a duplicate block type, so registration has to happen exactly once
 * per process — which is precisely the guarantee `boot()` gives and an
 * import-time side effect does not.
 *
 * Modules register theirs the same way, from their own `boot(app)` hook. Core
 * still never names a module.
 */
export default class BlocksProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const { registerCoreBlockResolvers } = await import('#services/core_block_resolvers')
    registerCoreBlockResolvers()
  }
}
