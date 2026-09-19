import { WebSettingsService } from '#services/settings_service'
import ContentPathsService from '#services/content_paths_service'
import {
  CONTENT_PATH_DEFAULTS,
  CONTENT_PATH_KEYS,
  CONTENT_PATH_KINDS,
  CONTENT_PATH_SECTION,
} from '#services/content_paths'
import { isSecretSettingKey } from '../secrets.js'
import { emptyReport, type DataSection, type ImportCtx } from '../registry.js'

/**
 * Site settings (`web_settings`): theme, appearance/saved colours, site meta,
 * auth-page config, forms, analytics ids, global code, breakpoints. Secret keys
 * (`*_enc`, anything with "secret") are dropped on the way out AND refused on
 * the way in — they are APP_KEY-bound and useless elsewhere.
 *
 * `applyPatches` treats an empty value as "reset to default", so an
 * intentionally-empty setting can't round-trip as `''` — but empty means
 * default by design, so this is lossless in practice.
 *
 * The blog URL prefixes (`content_paths`) are validated on write, and that
 * validation can refuse them (a reserved segment, a clash with a collection's
 * public pages on the target). They are therefore applied in their OWN step and
 * a refusal is a warning: one bad prefix must never take theme, site meta, the
 * front page and every other setting down with it.
 */

type Patch = { section: string; key: string; value: string }

/** Settings that describe where the site's screens live: on `skip`, keep the target's. */
const KEEP_ON_SKIP = new Set([CONTENT_PATH_SECTION, 'content_pages'])

const DEFAULT_BY_KEY: Record<string, string> = Object.fromEntries(
  CONTENT_PATH_KINDS.map((kind) => [CONTENT_PATH_KEYS[kind], CONTENT_PATH_DEFAULTS[kind]])
)

/** A value counts as "already set" when it differs from the built-in default. */
function isCustomised(section: string, key: string, current: string | undefined): boolean {
  if (!current) return false
  if (section === CONTENT_PATH_SECTION) return current !== DEFAULT_BY_KEY[key]
  return true
}

function patchesFrom(
  payload: { sections?: Record<string, Record<string, string>> },
  ctx: Pick<ImportCtx, 'mode' | 'idMap'>
): Patch[] {
  const regen = ctx.mode === 'regenerate'
  const patches: Patch[] = []
  for (const [section, kv] of Object.entries(payload.sections ?? {})) {
    for (const [key, value] of Object.entries(kv)) {
      if (isSecretSettingKey(key)) continue
      // Some settings hold a page id (e.g. auth_pages.*_page_id); in regenerate
      // mode those ids changed, so map them through.
      const v = String(value ?? '')
      patches.push({ section, key, value: regen ? (ctx.idMap.get(v) ?? v) : v })
    }
  }
  return patches
}

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
    const service = new WebSettingsService()
    let patches = patchesFrom(
      (data ?? {}) as { sections?: Record<string, Record<string, string>> },
      ctx
    )

    // `skip` = keep what the target already has. The export always carries the
    // defaults for the URL/role keys, so without this a `skip` import would reset
    // the target's blog URLs and role pages to their defaults.
    if (ctx.conflict === 'skip') {
      const current = await service.getMergedSections()
      patches = patches.filter((p) => {
        if (!KEEP_ON_SKIP.has(p.section)) return true
        const keep = isCustomised(p.section, p.key, current[p.section]?.[p.key])
        if (keep) report.skipped++
        return !keep
      })
    }

    const urlPatches = patches.filter((p) => p.section === CONTENT_PATH_SECTION)
    const otherPatches = patches.filter((p) => p.section !== CONTENT_PATH_SECTION)

    if (otherPatches.length > 0) {
      await service.applyPatches(otherPatches)
      report.updated += otherPatches.length
    }
    if (urlPatches.length > 0) {
      try {
        await service.applyPatches(urlPatches, { fromImport: true })
        report.updated += urlPatches.length
      } catch (e) {
        const message = `blog URLs (content_paths) were not applied — ${(e as Error).message}`
        report.warnings.push(message)
        ctx.log(`⚠ ${message}`)
      }
    }
    return report
  },

  async preflight(ctx, data) {
    const payload = (data ?? {}) as { sections?: Record<string, Record<string, string>> }
    const urlPatches = patchesFrom(payload, ctx).filter((p) => p.section === CONTENT_PATH_SECTION)
    if (urlPatches.length === 0) return []

    const warnings: string[] = []
    const issues = await new ContentPathsService().validate(urlPatches, {
      checkExistingPaths: false,
    })
    warnings.push(...issues.map((i) => `blog URLs would be skipped: ${i}`))

    // A page in the archive that sits under a moved prefix is legitimate (a page
    // wins over the blog screen there) — say so, because it hides the screen.
    const pagesFile = ctx.getFile('sections/pages.json')
    if (pagesFile && issues.length === 0) {
      try {
        const pages = (JSON.parse(pagesFile.toString('utf8')).pages ?? []) as Array<{
          path?: string
        }>
        for (const patch of urlPatches) {
          const prefix = patch.value.trim().replace(/^\/+|\/+$/g, '')
          if (!prefix || prefix === DEFAULT_BY_KEY[patch.key]) continue
          for (const page of pages) {
            const path = String(page.path ?? '')
            const hit =
              (patch.key === CONTENT_PATH_KEYS.archive && path === prefix) ||
              path.startsWith(`${prefix}/`)
            if (hit) {
              warnings.push(
                `the archive's page "/${path}" sits under the blog URL "/${prefix}" and will take precedence over it`
              )
            }
          }
        }
      } catch {
        /* an unreadable pages section is reported by its own import */
      }
    }
    return [...new Set(warnings)]
  },
}
