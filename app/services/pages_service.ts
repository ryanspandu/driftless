import Page from '#models/page'
import PageRevision from '#models/page_revision'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'

export type PageStatus = 'DRAFT' | 'PUBLISHED'
export type PageRenderMode = 'SSR' | 'SSG' | 'CSR'

/** A fresh, empty Puck document. */
const EMPTY_DOC: Record<string, unknown> = { content: [], root: {} }

export interface PageSummaryDto {
  id: string
  title: string
  path: string
  status: PageStatus
  renderMode: PageRenderMode
  layoutId: string | null
  headerTemplateId: string | null
  footerTemplateId: string | null
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
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
  content?: Record<string, unknown>
  seo?: Record<string, unknown>
}

interface UpdatePageInput {
  title?: string
  path?: string
  status?: PageStatus
  renderMode?: PageRenderMode
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
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
    const row = await Page.create({
      id: newUlid(),
      title: dto.title,
      path,
      status,
      renderMode: dto.renderMode ?? 'SSR',
      content: dto.content ?? EMPTY_DOC,
      seo: dto.seo ?? {},
      layoutId: dto.layoutId ?? null,
      headerTemplateId: dto.headerTemplateId ?? null,
      footerTemplateId: dto.footerTemplateId ?? null,
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
    if (dto.layoutId !== undefined) row.layoutId = dto.layoutId
    if (dto.headerTemplateId !== undefined) row.headerTemplateId = dto.headerTemplateId
    if (dto.footerTemplateId !== undefined) row.footerTemplateId = dto.footerTemplateId
    if (dto.content !== undefined) row.content = dto.content
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
    const rows = await PageRevision.query()
      .where('page_id', pageId)
      .orderBy('created_at', 'desc')
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

    row.content = revision.content
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

  /** Store the SSG HTML snapshot without bumping updated_at. */
  async cacheRenderedHtml(id: string, html: string): Promise<void> {
    await Page.query().where('id', id).update({ rendered_html: html })
  }

  /**
   * Clear every SSG HTML snapshot. Templates are shared across pages, so any
   * template edit can affect any SSG page — clearing all snapshots is correct.
   */
  async invalidateAllSnapshots(): Promise<void> {
    await Page.query().update({ rendered_html: null })
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
      layoutId: row.layoutId,
      headerTemplateId: row.headerTemplateId,
      footerTemplateId: row.footerTemplateId,
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
