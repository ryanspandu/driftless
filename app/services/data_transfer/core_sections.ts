import { registerDataSection } from './registry.js'
import { mediaSection } from './sections/media.js'
import { settingsSection } from './sections/settings.js'
import { redirectsSection } from './sections/redirects.js'

/**
 * Register core's own data sections. Called once from
 * `providers/data_transfer_provider.ts` (before `modules_provider` boots, so
 * core sections exist before any module registers its own).
 *
 * More core sections (media, components, collections, templates, records,
 * pages) plug in here as they are implemented.
 */
export function registerCoreDataSections(): void {
  registerDataSection(mediaSection)
  registerDataSection(settingsSection)
  registerDataSection(redirectsSection)
}
