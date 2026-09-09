import Page from '#models/page'
import { FILE_PAGES, type FilePage } from '#services/custom_templates.generated'
import type { PageSummaryDto } from '#services/pages_service'

/**
 * File-pages: routes that live inside a kit as code (`kits/<kit>/pages/*.tsx`),
 * with NO database row. A DB page always wins on a path clash, so the public
 * router only consults these after a DB lookup misses.
 */

/**
 * The file-page registered at this URL path (no leading slash; `""` = home), or
 * undefined. Only pages from an ACTIVE kit resolve — a deactivated kit's
 * file-pages 404 publicly, matching how they disappear from the admin list.
 */
export function findFilePageByPath(path: string, activeKits: Set<string>): FilePage | undefined {
  return FILE_PAGES.find((p) => p.path === path && activeKits.has(p.kit))
}

/** Every file-page (for the admin list). */
export function allFilePages(): readonly FilePage[] {
  return FILE_PAGES
}

/**
 * File-pages as admin-list rows, skipping any path a DB page already owns (a DB
 * page wins, so listing the shadowed file-page too would be confusing) and any
 * page from an inactive kit. The id is synthetic (`file:<kit>/<file>`) and
 * `source: 'file'` marks it read-only.
 */
export function fileSummaries(excludePaths: Set<string>, activeKits: Set<string>): PageSummaryDto[] {
  return FILE_PAGES.filter((fp) => !excludePaths.has(fp.path) && activeKits.has(fp.kit)).map((fp) => ({
    id: `file:${fp.kit}/${fp.file}`,
    title: fp.title,
    path: fp.path,
    status: 'PUBLISHED',
    renderMode: 'SSR',
    kind: 'CODE',
    component: `kitpage:${fp.kit}/${fp.file}`,
    layoutId: null,
    headerTemplateId: null,
    footerTemplateId: null,
    codeHeader: null,
    codeFooter: null,
    codeLayout: null,
    hideHeader: false,
    hideFooter: false,
    authorId: null,
    publishedAt: null,
    scheduledPublishAt: null,
    scheduledUnpublishAt: null,
    hasDraft: false,
    draftUpdatedAt: null,
    createdAt: '',
    updatedAt: '',
    source: 'file',
  }))
}

/**
 * A transient (unsaved) `Page` carrying just what `PageRenderer` reads, so a
 * file-page renders through the same code-page pipeline as a DB CODE page —
 * without a database row. Pure code: no editable region (content stays null),
 * always SSR, site-default header/footer/layout (opted into via `<SiteChrome>`).
 */
export function virtualPageForFilePage(fp: FilePage): Page {
  const page = new Page()
  page.merge({
    title: fp.title,
    path: fp.path,
    kind: 'CODE',
    component: `kitpage:${fp.kit}/${fp.file}`,
    renderMode: 'SSR',
    status: 'PUBLISHED',
    // No editable region — a file-page has no DB row to store one. An empty doc
    // (rather than undefined) keeps `hasBlocks` and the frame's rootProps happy.
    content: {},
    seo: {},
    layoutId: null,
    headerTemplateId: null,
    footerTemplateId: null,
    codeHeader: null,
    codeFooter: null,
    codeLayout: null,
    hideHeader: false,
    hideFooter: false,
  })
  return page
}
