import CmsService, { type CmsCollectionDto } from '#services/cms_service'
import ContentPathsService from '#services/content_paths_service'
import {
  assertDetailSettings,
  findSlugField,
  normalizeDetailPrefix,
} from '#services/collection_detail_rules'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * A collection's "Public detail pages" settings (`detail_pages_on`,
 * `detail_path_prefix`, `detail_page_id`).
 *
 * A section of its own, AFTER pages (60) and settings (70), because the settings
 * depend on things that only exist by then:
 *  - the template page id — pages get fresh ids in `regenerate` mode, so the
 *    pointer can only be remapped once `pages` has filled `ctx.idMap`;
 *  - the blog URL prefixes (`settings`), which the detail prefix is validated
 *    against.
 * Carrying them in `collections` (order 30) meant one prefix clash made
 * `createCollection` throw and the collection — table, records, relations — was
 * never created. Here a failure only leaves the feature OFF, with a warning.
 */
interface Entry {
  key: string
  detailPagesOn?: boolean
  detailPathPrefix?: string | null
  detailPageId?: string | null
}

function isSet(c: Pick<CmsCollectionDto, 'detailPagesOn' | 'detailPathPrefix' | 'detailPageId'>) {
  return Boolean(c.detailPagesOn || c.detailPathPrefix || c.detailPageId)
}

export const collectionDetailSection: DataSection = {
  name: 'collection_detail',
  owner: 'core',
  order: 74,
  label: 'Collection public pages',

  async export() {
    const all = await new CmsService().listCollections()
    const collections: Entry[] = all
      .filter((c) => c.source === 'DYNAMIC' && isSet(c))
      .map((c) => ({
        key: c.key,
        detailPagesOn: c.detailPagesOn,
        detailPathPrefix: c.detailPathPrefix,
        detailPageId: c.detailPageId,
      }))
    return { collections }
  },

  async import(ctx, data) {
    const report = emptyReport('collection_detail')
    const cms = new CmsService()
    const entries = ((data ?? {}) as { collections?: Entry[] }).collections ?? []
    const regen = ctx.mode === 'regenerate'

    for (const entry of entries) {
      let target: CmsCollectionDto
      try {
        target = await cms.findCollection(entry.key)
      } catch {
        report.warnings.push(`collection "${entry.key}" not found — its public pages were skipped`)
        continue
      }
      // `skip` keeps a target that already has its own configuration.
      if (ctx.conflict === 'skip' && isSet(target)) {
        report.skipped++
        continue
      }

      // The template page id: identity in `preserve` mode, remapped in `regenerate`
      // (the pages section has run by now); a page that did not make it across is
      // simply unset.
      const sourceId = entry.detailPageId || null
      const pageId = sourceId && regen ? (ctx.idMap.get(sourceId) ?? null) : sourceId

      const apply = (id: string | null) =>
        cms.updateCollection(entry.key, {
          detailPagesOn: entry.detailPagesOn === true,
          detailPathPrefix: entry.detailPathPrefix ?? null,
          detailPageId: id,
        })
      try {
        await apply(pageId)
        report.updated++
      } catch (e) {
        try {
          // Most often the template page is missing on this site: keep the rest.
          await apply(null)
          report.updated++
          report.warnings.push(
            `collection "${entry.key}": public pages enabled without a template page (${(e as Error).message}) — choose one in the collection's settings`
          )
        } catch (e2) {
          report.warnings.push(
            `collection "${entry.key}": public pages not restored — ${(e2 as Error).message}`
          )
        }
      }
    }
    return report
  },

  async preflight(_ctx, data) {
    const cms = new CmsService()
    const contentPaths = await new ContentPathsService().get()
    const entries = ((data ?? {}) as { collections?: Entry[] }).collections ?? []
    const warnings: string[] = []
    for (const entry of entries) {
      if (entry.detailPagesOn !== true) continue
      const prefix = normalizeDetailPrefix(entry.detailPathPrefix)
      try {
        const target = await cms.findCollection(entry.key)
        await assertDetailSettings({
          key: entry.key,
          selfId: target.id,
          type: target.type,
          kind: target.kind,
          slugField: findSlugField(target.fields),
          settings: { on: true, prefix, pageId: null },
        })
      } catch (e) {
        warnings.push(
          `collection "${entry.key}": public pages would not be restored — ${(e as Error).message}`
        )
      }
      if (prefix && Object.values(contentPaths).some((p) => p.split('/')[0] === prefix)) {
        warnings.push(
          `collection "${entry.key}": "${prefix}" is used by the blog URLs of this site`
        )
      }
    }
    return [...new Set(warnings)]
  },
}
