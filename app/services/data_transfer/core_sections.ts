import { registerDataSection } from './registry.js'
import { modulesSection } from './sections/modules.js'
import { mediaSection } from './sections/media.js'
import { usersSection } from './sections/users.js'
import { componentsSection } from './sections/components.js'
import { collectionsSection } from './sections/collections.js'
import { collectionRecordsSection } from './sections/collection_records.js'
import { collectionDetailSection } from './sections/collection_detail.js'
import { contentSection } from './sections/content.js'
import { templatesSection } from './sections/templates.js'
import { formsSection } from './sections/forms.js'
import { pagesSection } from './sections/pages.js'
import { menusSection } from './sections/menus.js'
import { settingsSection } from './sections/settings.js'
import { integrationsSection } from './sections/integrations.js'
import { redirectsSection } from './sections/redirects.js'
import { mailEventsSection } from './sections/mail_events.js'
import { kitsSection } from './sections/kits.js'

/**
 * Register core's own data sections in dependency order. Called once from
 * `providers/data_transfer_provider.ts` (before `modules_provider` boots).
 */
export function registerCoreDataSections(): void {
  registerDataSection(modulesSection) // 5  — restore module enable-state FIRST
  registerDataSection(mediaSection) // 10
  registerDataSection(usersSection) // 15
  registerDataSection(componentsSection) // 20
  registerDataSection(collectionsSection) // 30
  registerDataSection(templatesSection) // 40
  registerDataSection(collectionRecordsSection) // 50
  registerDataSection(contentSection) // 55
  registerDataSection(formsSection) // 58
  registerDataSection(pagesSection) // 60
  registerDataSection(menusSection) // 62 — after pages/records (id remap)
  registerDataSection(settingsSection) // 70
  registerDataSection(integrationsSection) // 71
  registerDataSection(redirectsSection) // 72
  registerDataSection(mailEventsSection) // 73 — after templates (template_id)
  registerDataSection(collectionDetailSection) // 74 — after pages (template id remap) + settings (blog prefixes)
  registerDataSection(kitsSection) // 75
}
