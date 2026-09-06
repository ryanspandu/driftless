import CmsService from '#services/cms_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Reusable CMS Components (field groups referenced by COMPONENT fields). Natural
 * key is `key` (globally unique), so import upserts on it. Must run before
 * collections, which may reference a component by `config.componentKey`.
 */
export const componentsSection: DataSection = {
  name: 'components',
  owner: 'core',
  order: 20,
  label: 'Components',
  tables: ['cms_components'],

  async export() {
    const cms = new CmsService()
    const components = await cms.listComponents()
    return {
      components: components.map((c) => ({
        key: c.key,
        label: c.label,
        icon: c.icon,
        fields: c.fields,
      })),
    }
  },

  async import(_ctx, data) {
    const report = emptyReport('components')
    const cms = new CmsService()
    const payload = (data ?? {}) as {
      components?: Array<{ key: string; label: string; icon?: string | null; fields?: unknown[] }>
    }
    const current = await cms.listComponents()
    const existingKeys = new Set(current.map((c) => c.key))

    for (const c of payload.components ?? []) {
      if (existingKeys.has(c.key)) {
        report.skipped++
        continue
      }
      await cms.createComponent({
        key: c.key,
        label: c.label,
        icon: c.icon ?? null,
        fields: (c.fields ?? []) as never,
      })
      report.created++
    }
    return report
  },
}
