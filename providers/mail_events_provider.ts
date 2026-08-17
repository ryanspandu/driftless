import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Declares core's own emails.
 *
 * A provider for the same reason `BlocksProvider` is one: `registerMailEvent`
 * throws on a duplicate key, so it must run exactly once per process. It runs
 * before `ModulesProvider`, so core's keys are claimed first and a module
 * colliding with one fails loudly in its own quarantined `boot()` rather than
 * silently taking over a core email's toggle.
 */
export default class MailEventsProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const { registerCoreMailEvents } = await import('#services/mail_events')
    registerCoreMailEvents()
  }
}
