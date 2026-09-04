import db from '@adonisjs/lucid/services/db'
import Page from '#models/page'
import PageRevision from '#models/page_revision'
import { newUlid } from '#services/ulid_service'
import { currentBuildId } from '#services/release'
import { CODE_PAGES } from '#services/code_pages.generated'
import { DateTime } from 'luxon'
import { sanitizePuckDocument } from '#services/html_sanitizer_service'
import RedirectsService from '#services/redirects_service'

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
  scheduledPublishAt: string | null
  scheduledUnpublishAt: string | null
  /** True when unpublished (staged) edits exist. */
  hasDraft: boolean
  draftUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PageDto extends PageSummaryDto {
  content: Record<string, unknown>
  seo: Record<string, unknown>
  /** The staged design, when a draft exists (else null). */
  draftContent: Record<string, unknown> | null
  draftSeo: Record<string, unknown> | null
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
  /** ISO strings or null to clear; applied verbatim to the schedule columns. */
  scheduledPublishAt?: string | null
  scheduledUnpublishAt?: string | null
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

  /** A path derived from `base` that is not already taken (`base`, `base-2`, …). */
  private async freePath(base: string): Promise<string> {
    const root = normalizePath(base) || 'page'
    let candidate = root
    let n = 2
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const taken = await Page.query().where('path', candidate).whereNull('deleted_at').first()
      if (!taken) return candidate
      candidate = normalizePath(`${root}-${n++}`)
    }
  }

  /** Copy a page into a new DRAFT with a free path. */
  async duplicate(id: string, authorId: number | null): Promise<PageDto> {
    const src = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()
    const row = await Page.create({
      id: newUlid(),
      title: `${src.title} (copy)`,
      path: await this.freePath(`${src.path}-copy`),
      status: 'DRAFT',
      renderMode: src.renderMode,
      kind: src.kind,
      component: src.component,
      content: src.content,
      seo: src.seo,
      layoutId: src.layoutId,
      headerTemplateId: src.headerTemplateId,
      footerTemplateId: src.footerTemplateId,
      hideHeader: src.hideHeader,
      hideFooter: src.hideFooter,
      authorId,
      publishedAt: null,
    })
    return this.toDto(row)
  }

  /** Serialisable page bundle (no ids/timestamps) for export → import. */
  async exportPage(id: string): Promise<Record<string, unknown>> {
    const p = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()
    return {
      _type: 'driftless.page',
      version: 1,
      title: p.title,
      path: p.path,
      renderMode: p.renderMode,
      kind: p.kind,
      component: p.component,
      hideHeader: p.hideHeader,
      hideFooter: p.hideFooter,
      content: p.content,
      seo: p.seo,
    }
  }

  /** Create a DRAFT page from an exported bundle. */
  async importPage(authorId: number | null, payload: unknown): Promise<PageDto> {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid page file.')
    const p = payload as Record<string, unknown>
    // Only accept files this app exported — an arbitrary JSON blob is not a page.
    if (p._type !== 'driftless.page') {
      throw new Error('Not a Driftless page export.')
    }
    const title = typeof p.title === 'string' && p.title ? p.title : 'Imported page'
    const kind: PageKind = p.kind === 'CODE' ? 'CODE' : 'BUILDER'
    const row = await Page.create({
      id: newUlid(),
      title,
      path: await this.freePath(typeof p.path === 'string' ? p.path : title),
      status: 'DRAFT',
      renderMode: (p.renderMode as PageRenderMode) ?? 'SSR',
      kind,
      component: kind === 'CODE' && typeof p.component === 'string' ? p.component : null,
      content: sanitizePuckDocument((p.content as Record<string, unknown>) ?? EMPTY_DOC),
      seo: (p.seo as Record<string, unknown>) ?? {},
      hideHeader: Boolean(p.hideHeader),
      hideFooter: Boolean(p.hideFooter),
      authorId,
      publishedAt: null,
    })
    return this.toDto(row)
  }

  /** Apply an action to many pages at once. Returns how many were affected. */
  async bulk(ids: string[], action: string, authorId: number | null): Promise<number> {
    let count = 0
    for (const id of ids) {
      try {
        if (action === 'publish') await this.publish(id, authorId, {})
        else if (action === 'unpublish') await this.update(id, authorId, { status: 'DRAFT' })
        else if (action === 'trash') await this.remove(id)
        else if (action === 'delete') await this.forceDelete(id)
        else throw new Error(`Unknown bulk action: ${action}`)
        count++
      } catch {
        // Skip a page that can't take the action (e.g. already gone) rather than
        // failing the whole batch.
      }
    }
    return count
  }

  async update(id: string, authorId: number | null, dto: UpdatePageInput): Promise<PageDto> {
    const row = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()

    const previousPath = row.path
    const wasPublished = row.status === 'PUBLISHED'

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
    if (dto.scheduledPublishAt !== undefined) {
      row.scheduledPublishAt = dto.scheduledPublishAt
        ? DateTime.fromISO(dto.scheduledPublishAt)
        : null
    }
    if (dto.scheduledUnpublishAt !== undefined) {
      row.scheduledUnpublishAt = dto.scheduledUnpublishAt
        ? DateTime.fromISO(dto.scheduledUnpublishAt)
        : null
    }
    let draftPromoted = false
    if (dto.status !== undefined) {
      const publishing = dto.status === 'PUBLISHED' && row.status !== 'PUBLISHED'
      if (publishing) {
        row.publishedAt = DateTime.now()
        // Promote any staged draft the caller didn't explicitly override —
        // publishing from the "Edit settings" dialog sends no content, so
        // without this the page would go live with stale/blank content.
        if (dto.content === undefined && row.draftContent) {
          row.content = row.draftContent
          draftPromoted = true
        }
        if (dto.seo === undefined && row.draftSeo) {
          row.seo = row.draftSeo
          draftPromoted = true
        }
        if (draftPromoted) {
          row.draftContent = null
          row.draftSeo = null
          row.draftUpdatedAt = null
        }
        // The scheduled publish (if any) has now happened; clear it so a stale
        // timestamp can't re-publish the page after a later unpublish.
        row.scheduledPublishAt = null
      }
      row.status = dto.status
    }

    // Any edit invalidates the SSG HTML snapshot.
    row.renderedHtml = null

    await row.save()

    // Moving a page that was already live: capture a 301 so its old URL keeps
    // working. Best-effort — a redirect failure must not fail the page save.
    if (wasPublished && row.path !== previousPath) {
      await new RedirectsService().capturePathChange(previousPath, row.path).catch(() => {})
    }

    // Snapshot a revision whenever the page's design (content/seo) changes —
    // including a draft promoted to live by publishing.
    if (dto.content !== undefined || dto.seo !== undefined || draftPromoted) {
      await this.snapshotRevision(row, authorId)
    }

    return this.toDto(row)
  }

  /**
   * Stage edits without touching the live page. Autosave calls this: it writes
   * only the draft columns, so a published page keeps serving its current HTML
   * (and its SSG snapshot) until Publish promotes the draft.
   */
  async saveDraft(
    id: string,
    dto: { content?: Record<string, unknown>; seo?: Record<string, unknown> }
  ): Promise<PageDto> {
    const row = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()
    // `updated_at` has `autoUpdate`, so a model save bumps it — but autosave is
    // not a live-page edit and must not reorder the pages list. Capture the raw
    // stored value first and restore it afterwards (as a raw string, so no
    // date-format round-trip), letting the model still serialise the draft cols.
    const before = await db.from('pages').where('id', id).select('updated_at').first()
    if (dto.content !== undefined) row.draftContent = sanitizePuckDocument(dto.content)
    if (dto.seo !== undefined) row.draftSeo = dto.seo
    row.draftUpdatedAt = DateTime.now()
    await row.save()
    if (before && before.updated_at !== undefined && before.updated_at !== null) {
      await db.from('pages').where('id', id).update({ updated_at: before.updated_at })
    }
    return this.findOne(id)
  }

  /**
   * Publish the editor's current state: write it to the live `content`/`seo`
   * (plus any page-setting changes), flip to PUBLISHED, and clear the draft.
   * Reuses `update` so redirect capture, revisioning and snapshot invalidation
   * all happen exactly as before.
   */
  async publish(id: string, authorId: number | null, dto: UpdatePageInput): Promise<PageDto> {
    const row = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()
    // The editor sends the design explicitly; a scheduled publish sends nothing,
    // so fall back to promoting whatever was staged as a draft.
    const content = dto.content !== undefined ? dto.content : (row.draftContent ?? undefined)
    const seo = dto.seo !== undefined ? dto.seo : (row.draftSeo ?? undefined)
    await this.update(id, authorId, { ...dto, content, seo, status: 'PUBLISHED' })
    // Draft has been promoted; drop it so the editor reopens on the live design.
    await Page.query()
      .where('id', id)
      .update({ draft_content: null, draft_seo: null, draft_updated_at: null })
    return this.findOne(id)
  }

  /** Throw away staged edits; the editor falls back to the live design. */
  async discardDraft(id: string): Promise<PageDto> {
    await Page.query()
      .where('id', id)
      .whereNull('deleted_at')
      .update({ draft_content: null, draft_seo: null, draft_updated_at: null })
    return this.findOne(id)
  }

  /** Get (minting if absent) the shareable preview token for a page. */
  async ensurePreviewToken(id: string): Promise<string> {
    const row = await Page.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (!row.previewToken) {
      row.previewToken = newUlid()
      await row.save()
    }
    return row.previewToken
  }

  /** Revoke the current preview token (old links stop working). */
  async clearPreviewToken(id: string): Promise<void> {
    await Page.query().where('id', id).update({ preview_token: null })
  }

  async findByPreviewToken(token: string): Promise<Page | null> {
    if (!token) return null
    return Page.query().where('preview_token', token).whereNull('deleted_at').first()
  }

  /**
   * Apply due scheduled transitions. Returns how many pages were published /
   * unpublished. Invoked by the `pages:run-schedule` command (OS cron).
   */
  async runScheduled(
    now: DateTime = DateTime.now()
  ): Promise<{ published: number; unpublished: number }> {
    const iso = now.toISO()!

    const toPublish = await Page.query()
      .whereNull('deleted_at')
      .whereNot('status', 'PUBLISHED')
      .whereNotNull('scheduled_publish_at')
      .where('scheduled_publish_at', '<=', iso)
    for (const row of toPublish) {
      // One bad page must not abort the whole scheduled run.
      try {
        await this.publish(row.id, row.authorId, {})
        await Page.query().where('id', row.id).update({ scheduled_publish_at: null })
      } catch {
        // leave the schedule in place; the next run retries this page.
      }
    }

    const toUnpublish = await Page.query()
      .whereNull('deleted_at')
      .where('status', 'PUBLISHED')
      .whereNotNull('scheduled_unpublish_at')
      .where('scheduled_unpublish_at', '<=', iso)
    for (const row of toUnpublish) {
      try {
        await this.update(row.id, row.authorId, { status: 'DRAFT' })
        await Page.query().where('id', row.id).update({ scheduled_unpublish_at: null })
      } catch {
        // one page failing must not abort the rest of the scheduled run.
      }
    }

    return { published: toPublish.length, unpublished: toUnpublish.length }
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

  /** How many revisions to keep per page. Older ones are pruned on each save. */
  private static readonly REVISION_RETENTION = 50

  private async snapshotRevision(row: Page, authorId: number | null): Promise<void> {
    await PageRevision.create({
      id: newUlid(),
      pageId: row.id,
      content: row.content,
      seo: row.seo,
      status: row.status,
      authorId,
    })
    await this.pruneRevisions(row.id)
  }

  /**
   * Keep only the newest N revisions of a page.
   *
   * Revisions are snapshotted on every content/SEO change, so a page edited for
   * months would otherwise accumulate an unbounded history (each row carries a
   * full Puck document). Pruning here keeps the table bounded without a cron.
   */
  private async pruneRevisions(pageId: string): Promise<void> {
    const keep = await PageRevision.query()
      .where('page_id', pageId)
      .orderBy('created_at', 'desc')
      .select('id')
      .limit(PagesService.REVISION_RETENTION)
    if (keep.length < PagesService.REVISION_RETENTION) return

    await PageRevision.query()
      .where('page_id', pageId)
      .whereNotIn(
        'id',
        keep.map((r) => r.id)
      )
      .delete()
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
      scheduledPublishAt: row.scheduledPublishAt ? row.scheduledPublishAt.toISO() : null,
      scheduledUnpublishAt: row.scheduledUnpublishAt ? row.scheduledUnpublishAt.toISO() : null,
      hasDraft: row.draftContent != null,
      draftUpdatedAt: row.draftUpdatedAt ? row.draftUpdatedAt.toISO() : null,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  private toDto(row: Page): PageDto {
    return {
      ...this.toSummary(row),
      content: row.content,
      seo: row.seo,
      draftContent: row.draftContent ?? null,
      draftSeo: row.draftSeo ?? null,
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
