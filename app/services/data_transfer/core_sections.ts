import { registerDataSection } from './registry.js'
import { mediaSection } from './sections/media.js'
import { usersSection } from './sections/users.js'
import { componentsSection } from './sections/components.js'
import { collectionsSection } from './sections/collections.js'
import { collectionRecordsSection } from './sections/collection_records.js'
import { templatesSection } from './sections/templates.js'
import { pagesSection } from './sections/pages.js'
import { settingsSection } from './sections/settings.js'
import { redirectsSection } from './sections/redirects.js'

/**
 * Register core's own data sections in dependency order. Called once from
 * `providers/data_transfer_provider.ts` (before `modules_provider` boots).
 */
export function registerCoreDataSections(): void {
  registerDataSection(mediaSection) // 10
  registerDataSection(usersSection) // 15
  registerDataSection(componentsSection) // 20
  registerDataSection(collectionsSection) // 30
  registerDataSection(templatesSection) // 40
  registerDataSection(collectionRecordsSection) // 50
  registerDataSection(pagesSection) // 60
  registerDataSection(settingsSection) // 70
  registerDataSection(redirectsSection) // 72
}
