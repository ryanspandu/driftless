import Template, { type TemplateType } from '#models/template'
import Page from '#models/page'
import MailEventSetting from '#models/mail_event_setting'
import PagesService from '#services/pages_service'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'
import { sanitizePuckDocument } from '#services/html_sanitizer_service'

const pagesService = new PagesService()

const EMPTY_DOC: Record<string, unknown> = { content: [], root: {} }

/** Max recursion depth when resolving nested TemplateRef includes. */
const MAX_REF_DEPTH = 5

export interface TemplateSummaryDto {
  id: string
  name: string
  type: TemplateType
  isDefault: boolean
  /** The CMS collection a COLLECTION template is the item card for; null otherwise. */
  collectionKey: string | null
  createdAt: string
  updatedAt: string
}

export interface TemplateDto extends TemplateSummaryDto {
  content: Record<string, unknown>
  /** Email HTML, present only on EMAIL templates that have been published. */
  renderedHtml: string | null
}

interface CreateTemplateInput {
  name: string
  type: TemplateType
  content?: Record<string, unknown>
  isDefault?: boolean
  collectionKey?: string | null
}

interface UpdateTemplateInput {
  /**
   * Email HTML, rendered by the builder in the operator's browser.
   *
   * Client-supplied on purpose: the email block set and React are already
   * loaded there, whereas the server has no SSR bundle for them. It is written
   * only for EMAIL templates (see `update`), and reaching this endpoint at all
   * requires `template:update` — an actor who has it can already put arbitrary
   * markup in a page's Code Block.
   */
  renderedHtml?: string | null
  name?: string
  content?: Record<string, unknown>
  isDefault?: boolean
  collectionKey?: string | null
}

/**
 * Collect template ids referenced anywhere in a Puck node tree.
 *
 * Two blocks embed a template: `TemplateRef` (a header/footer/component
 * include) and `CollectionList` in template mode, whose `templateId` is the
 * COLLECTION template repeated once per record. Both carry the id under the
 * same prop name on purpose — `usages()` and the public reachability check
 * find either by the one `"templateId":"<id>"` needle.
 */
function collectRefIds(node: unknown, acc: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefIds(child, acc)
    return
  }
  if (node && typeof node === 'object') {
    const block = node as { type?: string; props?: Record<string, unknown> }
    if (
      (block.type === 'TemplateRef' || block.type === 'CollectionList') &&
      typeof block.props?.templateId === 'string' &&
      block.props.templateId
    ) {
      acc.push(block.props.templateId as string)
    }
    if (block.props) {
      for (const value of Object.values(block.props)) collectRefIds(value, acc)
    }
  }
}

export default class TemplatesService {
  async list(type?: TemplateType): Promise<TemplateSummaryDto[]> {
    const query = Template.query().whereNull('deleted_at').orderBy('updated_at', 'desc')
    if (type) query.where('type', type)
    const rows = await query
    return rows.map((r) => this.toSummary(r))
  }

  async find(id: string): Promise<TemplateDto> {
    const row = await Template.query().where('id', id).whereNull('deleted_at').firstOrFail()
    return this.toDto(row)
  }

  async create(dto: CreateTemplateInput): Promise<TemplateDto> {
    const name = String(dto.name ?? '').trim()
    if (!name) throw new Error('Name is required')

    const row = await Template.create({
      id: newUlid(),
      name,
      type: dto.type,
      content: sanitizePuckDocument(dto.content ?? EMPTY_DOC),
      isDefault: dto.isDefault ?? false,
      collectionKey: this.collectionKeyFor(dto.type, dto.collectionKey),
    })
    if (row.isDefault) await this.clearOtherDefaults(row.type, row.id)
    return this.toDto(row)
  }

  async update(id: string, dto: UpdateTemplateInput): Promise<TemplateDto> {
    const row = await Template.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (dto.name !== undefined) row.name = dto.name
    if (dto.content !== undefined) row.content = sanitizePuckDocument(dto.content)
    /**
     * Only EMAIL templates carry rendered HTML. Ignoring it elsewhere means a
     * malformed request cannot smuggle a blob onto a header template, where
     * nothing would ever read it back out.
     */
    if (dto.renderedHtml !== undefined && row.type === 'EMAIL') {
      row.renderedHtml = dto.renderedHtml
    }
    if (dto.isDefault !== undefined) row.isDefault = dto.isDefault
    if (dto.collectionKey !== undefined) {
      row.collectionKey = this.collectionKeyFor(row.type, dto.collectionKey)
    }
    await row.save()
    if (dto.isDefault) await this.clearOtherDefaults(row.type, row.id)
    // Templates are shared — any edit can affect SSG pages that include it.
    await pagesService.invalidateAllSnapshots()
    return this.toDto(row)
  }

  async remove(id: string): Promise<void> {
    const usage = await this.usages(id)
    if (usage.total > 0) {
      throw new Error(
        `Template is in use by ${usage.pages} page(s) and ${usage.templates} template(s) — remove those references first`
      )
    }
    const row = await Template.query().where('id', id).whereNull('deleted_at').firstOrFail()
    row.deletedAt = DateTime.now()
    row.isDefault = false
    await row.save()
    await pagesService.invalidateAllSnapshots()
  }

  /** Count pages + other templates that reference this template id. */
  async usages(id: string): Promise<{ pages: number; templates: number; total: number }> {
    /**
     * `CAST(... AS TEXT)` rather than pg's `::text`, which threw on SQLite —
     * the test suite's driver. `public_templates_controller` already used the
     * portable form for the same query; this one had simply never been
     * reached from a test.
     */
    const needle = `%"templateId":"${id}"%`

    /**
     * A page uses a template through its layout/header/footer columns, or from
     * inside its design: a TemplateRef include, or a CollectionList repeating a
     * COLLECTION template. The staged draft counts too — deleting a template
     * the operator has just placed, before they publish, would leave the draft
     * pointing at nothing.
     */
    const pageRow = await Page.query()
      .where((q) =>
        q
          .where('layout_id', id)
          .orWhere('header_template_id', id)
          .orWhere('footer_template_id', id)
          .orWhereRaw('CAST(content AS TEXT) like ?', [needle])
          .orWhereRaw('CAST(draft_content AS TEXT) like ?', [needle])
      )
      .whereNull('deleted_at')
      .count('* as total')
    const pages = Number((pageRow[0] as any)?.$extras?.total ?? 0)

    const templateRow = await Template.query()
      .whereNot('id', id)
      .whereNull('deleted_at')
      .whereRaw('CAST(content AS TEXT) like ?', [needle])
      .count('* as total')
    const templates = Number((templateRow[0] as any)?.$extras?.total ?? 0)

    /**
     * An EMAIL template wired to a notification counts too. Without this,
     * deleting one silently reverts that email to the built-in design — the
     * operator's copy would keep sending, just not the way they designed it.
     */
    const mailRow = await MailEventSetting.query().where('template_id', id).count('* as total')
    const mails = Number((mailRow[0] as any)?.$extras?.total ?? 0)

    return { pages, templates: templates + mails, total: pages + templates + mails }
  }

  async duplicate(id: string): Promise<TemplateDto> {
    const source = await Template.query().where('id', id).whereNull('deleted_at').firstOrFail()
    const row = await Template.create({
      id: newUlid(),
      name: `${source.name} (copy)`,
      type: source.type,
      content: sanitizePuckDocument(source.content),
      isDefault: false,
      collectionKey: source.collectionKey ?? null,
    })
    return this.toDto(row)
  }

  /** The site default template for a type, or null. */
  async getDefault(type: TemplateType): Promise<TemplateDto | null> {
    const row = await Template.query()
      .where('type', type)
      .where('is_default', true)
      .whereNull('deleted_at')
      .first()
    return row ? this.toDto(row) : null
  }

  async setDefault(id: string): Promise<TemplateDto> {
    const row = await Template.query().where('id', id).whereNull('deleted_at').firstOrFail()
    row.isDefault = true
    await row.save()
    await this.clearOtherDefaults(row.type, row.id)
    // Default changes alter which template SSG pages inherit — drop snapshots.
    await pagesService.invalidateAllSnapshots()
    return this.toDto(row)
  }

  /**
   * Resolve every TemplateRef referenced across the given docs into a map of
   * `{ [templateId]: content }`, recursively (so a referenced template that itself
   * references others is included). Guards against cycles + runaway depth.
   */
  async resolveRefs(
    docs: Array<Record<string, unknown> | null | undefined>,
    depth = 0,
    visited: Set<string> = new Set()
  ): Promise<Record<string, Record<string, unknown>>> {
    const map: Record<string, Record<string, unknown>> = {}
    if (depth >= MAX_REF_DEPTH) return map

    const ids: string[] = []
    for (const doc of docs) {
      if (!doc) continue
      collectRefIds((doc as { content?: unknown }).content, ids)
      collectRefIds((doc as { zones?: unknown }).zones, ids)
    }

    const fresh = [...new Set(ids)].filter((id) => !visited.has(id))
    if (!fresh.length) return map

    const rows = await Template.query().whereIn('id', fresh).whereNull('deleted_at')
    const nextDocs: Record<string, unknown>[] = []
    for (const row of rows) {
      visited.add(row.id)
      map[row.id] = row.content
      nextDocs.push(row.content)
    }

    if (nextDocs.length) {
      const nested = await this.resolveRefs(nextDocs, depth + 1, visited)
      Object.assign(map, nested)
    }
    return map
  }

  private async clearOtherDefaults(type: TemplateType, keepId: string): Promise<void> {
    await Template.query()
      .where('type', type)
      .whereNot('id', keepId)
      .where('is_default', true)
      .update({ is_default: false })
  }

  /**
   * A collection key is meaningful only on COLLECTION templates. Dropping it
   * elsewhere keeps a header from claiming a collection it can never bind to,
   * which would otherwise surface in the CollectionList template picker.
   */
  private collectionKeyFor(type: TemplateType, key: string | null | undefined): string | null {
    if (type !== 'COLLECTION') return null
    const trimmed = String(key ?? '').trim()
    if (!trimmed) throw new Error('A collection template must be bound to a collection')
    return trimmed
  }

  private toSummary(row: Template): TemplateSummaryDto {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      isDefault: row.isDefault,
      collectionKey: row.collectionKey ?? null,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  private toDto(row: Template): TemplateDto {
    return { ...this.toSummary(row), content: row.content, renderedHtml: row.renderedHtml ?? null }
  }
}
