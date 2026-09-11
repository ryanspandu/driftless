import { WebSettingsService } from '#services/settings_service'
import { isSecretSettingKey } from '../secrets.js'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Site settings (`web_settings`): theme, appearance/saved colours, site meta,
 * auth-page config, forms, analytics ids, global code, breakpoints. Secret keys
 * (`*_enc`, anything with "secret") are dropped on the way out AND refused on
 * the way in — they are APP_KEY-bound and useless elsewhere.
 *
 * `applyPatches` treats an empty value as "reset to default", so an
 * intentionally-empty setting can't round-trip as `''` — but empty means
 * default by design, so this is lossless in practice.
 */
export const settingsSection: DataSection = {
  name: 'settings',
  owner: 'core',
  order: 70,
  label: 'Site settings',
  tables: ['web_settings'],

  async export() {
    const merged = await new WebSettingsService().getMergedSections()
    const sections: Record<string, Record<string, string>> = {}
    for (const [section, kv] of Object.entries(merged)) {
      const clean: Record<string, string> = {}
      for (const [key, value] of Object.entries(kv)) {
        if (!isSecretSettingKey(key)) clean[key] = value
      }
      if (Object.keys(clean).length > 0) sections[section] = clean
    }
    return { sections }
  },

  async import(ctx, data) {
    const report = emptyReport('settings')
    const payload = (data ?? {}) as { sections?: Record<string, Record<string, string>> }
    const regen = ctx.mode === 'regenerate'
    const patches: Array<{ section: string; key: string; value: string }> = []
    for (const [section, kv] of Object.entries(payload.sections ?? {})) {
      for (const [key, value] of Object.entries(kv)) {
        if (isSecretSettingKey(key)) continue
        // Some settings hold a page id (e.g. auth_pages.*_page_id); in regenerate
        // mode those ids changed, so map them through.
        const v = String(value ?? '')
        patches.push({ section, key, value: regen ? (ctx.idMap.get(v) ?? v) : v })
      }
    }
    if (patches.length > 0) {
      await new WebSettingsService().applyPatches(patches)
      report.updated = patches.length
    }
    return report
  },
}
