import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Registers core's own export/import data sections.
 *
 * A provider (not an import-time side effect) so registration happens exactly
 * once per process, and it is listed BEFORE `modules_provider` in `adonisrc.ts`
 * so core sections exist before any module's `boot()` registers its own —
 * mirroring `blocks_provider` / `mail_events_provider`. Core still never names a
 * module; modules plug in from their own `boot(app)` hook.
 */
export default class DataTransferProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const { registerCoreDataSections } = await import('#services/data_transfer/core_sections')
    registerCoreDataSections()
  }
}
