import Page from '#models/page'
import PageRevision from '#models/page_revision'
import { newUlid } from '#services/ulid_service'
import { currentBuildId } from '#services/release'
import { CODE_PAGES } from '#services/code_pages.generated'
import { DateTime } from 'luxon'
import { sanitizePuckDocument } from '#services/html_sanitizer_service'

export type PageStatus = 'DRAFT' | 'PUBLISHED'
export type PageRenderMode = 'SSR' | 'SSG' | 'CSR'
export type PageKind = 'BUILDER' | 'CODE'

/** A fresh, empty Puck document. */
const EMPTY_DOC: Record<string, unknown> = { content: [], root: {} }

export interface PageSummaryDto {
  id: string
  title: string
  path: string
  status: PageStatus
  renderMode: PageRenderMode
  kind: PageKind
  component: string | null
  layoutId: string | null
  headerTemplateId: string | null
  footerTemplateId: string | null
  hideHeader: boolean
  hideFooter: boolean
  authorId: number | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PageDto extends PageSummaryDto {
  content: Record<string, unknown>
  seo: Record<string, unknown>
}

export interface PageRevisionDto {
  id: string
  pageId: string
  status: PageStatus
  authorId: number | null
  createdAt: string
}

interface CreatePageInput {
  title: string
  path: string
  status?: PageStatus
  renderMode?: PageRenderMode
  kind?: PageKind
  component?: string | null
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
  hideHeader?: boolean
  hideFooter?: boolean
  content?: Record<string, unknown>
  seo?: Record<string, unknown>
}

interface UpdatePageInput {
  title?: string
  path?: string
  status?: PageStatus
  renderMode?: PageRenderMode
  kind?: PageKind
  component?: string | null
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
  hideHeader?: boolean
  hideFooter?: boolean
  content?: Record<string, unknown>
  seo?: Record<string, unknown>
}

/** Lowercase, collapse to a slug that may contain `/` for nested paths. */
function normalizePath(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/-*\/-*/g, '/')
    .replace(/^[-/]+|[-/]+$/g, '')
    .slice(0, 120)
}

export default class PagesService {
  async findAll(): Promise<PageSummaryDto[]> {
    const rows = await Page.query().whereNull('deleted_at').orderBy('updated_at', 'desc')
    return rows.map((r) => this.toSummary(r))
  }

  async findOne(id: string): Promise<PageDto> {
    const row = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()
    return this.toDto(row)
  }

  async create(authorId: number, dto: CreatePageInput): Promise<PageDto> {
    const path = normalizePath(dto.path)
    if (!path) throw new Error('Path is required')
    await this.assertPathFree(path)

    const status = dto.status ?? 'DRAFT'
    const kind = dto.kind ?? 'BUILDER'
    const component = kind === 'CODE' ? this.assertComponent(dto.component) : null

    const row = await Page.create({
      id: newUlid(),
      title: dto.title,
      path,
      status,
      renderMode: dto.renderMode ?? 'SSR',
      kind,
      component: kind === 'CODE' ? component : null,
      content: sanitizePuckDocument(dto.content ?? EMPTY_DOC),
      seo: dto.seo ?? {},
      layoutId: dto.layoutId ?? null,
      headerTemplateId: dto.headerTemplateId ?? null,
      footerTemplateId: dto.footerTemplateId ?? null,
      hideHeader: dto.hideHeader ?? false,
      hideFooter: dto.hideFooter ?? false,
      authorId,
      publishedAt: status === 'PUBLISHED' ? DateTime.now() : null,
    })
    return this.toDto(row)
  }

  async update(id: string, authorId: number | null, dto: UpdatePageInput): Promise<PageDto> {
    const row = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()

    if (dto.path !== undefined) {
      const path = normalizePath(dto.path)
      if (!path) throw new Error('Path is required')
      if (path !== row.path) await this.assertPathFree(path, id)
      row.path = path
    }
    if (dto.title !== undefined) row.title = dto.title
    if (dto.renderMode !== undefined) row.renderMode = dto.renderMode
    if (dto.kind !== undefined) row.kind = dto.kind
    if (dto.component !== undefined) row.component = dto.component

    /**
     * Re-validated after the assignments so it covers every route in: switching
     * an existing builder page to CODE, changing the component, or updating a
     * CODE page while leaving both fields untouched.
     */
    if (row.kind === 'CODE') row.component = this.assertComponent(row.component)
    else row.component = null
    if (dto.layoutId !== undefined) row.layoutId = dto.layoutId
    if (dto.headerTemplateId !== undefined) row.headerTemplateId = dto.headerTemplateId
    if (dto.footerTemplateId !== undefined) row.footerTemplateId = dto.footerTemplateId
    if (dto.hideHeader !== undefined) row.hideHeader = dto.hideHeader
    if (dto.hideFooter !== undefined) row.hideFooter = dto.hideFooter
    if (dto.content !== undefined) row.content = sanitizePuckDocument(dto.content)
    if (dto.seo !== undefined) row.seo = dto.seo
    if (dto.status !== undefined) {
      if (dto.status === 'PUBLISHED' && row.status !== 'PUBLISHED') row.publishedAt = DateTime.now()
      row.status = dto.status
    }

    // Any edit invalidates the SSG HTML snapshot.
    row.renderedHtml = null

    await row.save()

    // Snapshot a revision whenever the page's design (content/seo) changes.
    if (dto.content !== undefined || dto.seo !== undefined) {
      await this.snapshotRevision(row, authorId)
    }

    return this.toDto(row)
  }

  async listRevisions(pageId: string): Promise<PageRevisionDto[]> {
    const rows = await PageRevision.query().where('page_id', pageId).orderBy('created_at', 'desc')
    return rows.map((r) => this.toRevisionDto(r))
  }

  async restoreRevision(
    pageId: string,
    revisionId: string,
    authorId: number | null
  ): Promise<PageDto> {
    const revision = await PageRevision.query()
      .where('id', revisionId)
      .where('page_id', pageId)
      .firstOrFail()

    const row = await Page.query().where('id', pageId).whereNull('deleted_at').firstOrFail()

    row.content = sanitizePuckDocument(revision.content)
    row.seo = revision.seo
    if (revision.status === 'PUBLISHED' && row.status !== 'PUBLISHED') {
      row.publishedAt = DateTime.now()
    }
    row.status = revision.status
    row.renderedHtml = null
    await row.save()

    // Snapshot the restore as a new revision so restores are themselves versioned.
    await this.snapshotRevision(row, authorId)

    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const row = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()
    row.deletedAt = DateTime.now()
    row.path = `__deleted_${id}__${row.path}`
    await row.save()
  }

  /** Soft-deleted rows (the Trash). Path is restored to its display form. */
  async findTrashed(): Promise<PageSummaryDto[]> {
    const rows = await Page.query().whereNotNull('deleted_at').orderBy('updated_at', 'desc')
    return rows.map((r) => {
      const dto = this.toSummary(r)
      dto.path = this.stripDeletedPrefix(r.id, dto.path)
      return dto
    })
  }

  async restore(id: string): Promise<PageSummaryDto> {
    const row = await Page.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    const cleanPath = this.stripDeletedPrefix(id, row.path)
    const clash = await Page.query()
      .where('path', cleanPath)
      .whereNull('deleted_at')
      .whereNot('id', id)
      .first()
    row.path = clash ? `${cleanPath}-restored-${id.slice(-6)}` : cleanPath
    row.deletedAt = null
    await row.save()
    return this.toSummary(row)
  }

  async forceDelete(id: string): Promise<void> {
    const row = await Page.query().where('id', id).whereNotNull('deleted_at').firstOrFail()
    await PageRevision.query().where('page_id', id).delete()
    await row.delete()
  }

  /**
   * Store the SSG HTML snapshot without bumping updated_at.
   *
   * Stamped with the build that rendered it, because the HTML has hashed asset
   * URLs in it and outlives the build those chunks came from.
   */
  async cacheRenderedHtml(id: string, html: string): Promise<void> {
    await Page.query()
      .where('id', id)
      .update({ rendered_html: html, rendered_build: currentBuildId() })
  }

  /**
   * Clear every SSG HTML snapshot. Templates are shared across pages, so any
   * template edit can affect any SSG page — clearing all snapshots is correct.
   *
   * This is for *content* changes. Snapshots left behind by an older build do
   * not need clearing — they fail the build-id check on read and re-render
   * themselves, which is the only version that survives a rolling restart.
   */
  async invalidateAllSnapshots(): Promise<void> {
    await Page.query().update({ rendered_html: null, rendered_build: null })
  }

  private async snapshotRevision(row: Page, authorId: number | null): Promise<void> {
    await PageRevision.create({
      id: newUlid(),
      pageId: row.id,
      content: row.content,
      seo: row.seo,
      status: row.status,
      authorId,
    })
  }

  /**
   * A CODE page must name a component that exists in this build.
   *
   * Checked against the generated manifest rather than trusted from the client,
   * because the admin picker is not the only way in — the API accepts a raw
   * value. An unchecked name does not fail loudly: it reaches the browser and
   * throws inside Inertia's async resolver, which reads as a blank page rather
   * than an error. Refusing the write is the only point where it can still be
   * reported as what it is.
   */
  private assertComponent(value: string | null | undefined): string {
    const component = (value ?? '').trim()
    if (!component) throw new Error('A code page needs a component')
    if (!CODE_PAGES.includes(component)) {
      const known = CODE_PAGES.length ? CODE_PAGES.join(', ') : 'none in this build'
      throw new Error(`Unknown page component "${component}". Available: ${known}`)
    }
    return component
  }

  private async assertPathFree(path: string, exceptId?: string): Promise<void> {
    const q = Page.query().where('path', path).whereNull('deleted_at')
    if (exceptId) q.whereNot('id', exceptId)
    const existing = await q.first()
    if (existing) throw new Error('Path already in use')
  }

  private stripDeletedPrefix(id: string, value: string): string {
    const prefix = `__deleted_${id}__`
    return value.startsWith(prefix) ? value.slice(prefix.length) : value
  }

  private toSummary(row: Page): PageSummaryDto {
    return {
      id: row.id,
      title: row.title,
      path: row.path,
      status: row.status,
      renderMode: row.renderMode,
      kind: row.kind ?? 'BUILDER',
      component: row.component,
      layoutId: row.layoutId,
      headerTemplateId: row.headerTemplateId,
      footerTemplateId: row.footerTemplateId,
      // Coalesced: rows created before the columns existed read back as null
      // under SQLite, and `null` here would render as an indeterminate checkbox.
      hideHeader: Boolean(row.hideHeader),
      hideFooter: Boolean(row.hideFooter),
      authorId: row.authorId,
      publishedAt: row.publishedAt ? row.publishedAt.toISO() : null,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  private toDto(row: Page): PageDto {
    return {
      ...this.toSummary(row),
      content: row.content,
      seo: row.seo,
    }
  }

  private toRevisionDto(row: PageRevision): PageRevisionDto {
    return {
      id: row.id,
      pageId: row.pageId,
      status: row.status,
      authorId: row.authorId,
      createdAt: row.createdAt.toISO()!,
    }
  }
}
