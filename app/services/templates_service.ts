import Template, { type TemplateType } from '#models/template'
import Page from '#models/page'
import PagesService from '#services/pages_service'
import { newUlid } from '#services/ulid_service'
import { DateTime } from 'luxon'

const pagesService = new PagesService()

const EMPTY_DOC: Record<string, unknown> = { content: [], root: {} }

/** Max recursion depth when resolving nested TemplateRef includes. */
const MAX_REF_DEPTH = 5

export interface TemplateSummaryDto {
  id: string
  name: string
  type: TemplateType
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface TemplateDto extends TemplateSummaryDto {
  content: Record<string, unknown>
}

interface CreateTemplateInput {
  name: string
  type: TemplateType
  content?: Record<string, unknown>
  isDefault?: boolean
}

interface UpdateTemplateInput {
  name?: string
  content?: Record<string, unknown>
  isDefault?: boolean
}

/** Collect TemplateRef ids referenced anywhere in a Puck node tree. */
function collectRefIds(node: unknown, acc: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefIds(child, acc)
    return
  }
  if (node && typeof node === 'object') {
    const block = node as { type?: string; props?: Record<string, unknown> }
    if (block.type === 'TemplateRef' && typeof block.props?.templateId === 'string') {
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
      content: dto.content ?? EMPTY_DOC,
      isDefault: dto.isDefault ?? false,
    })
    if (row.isDefault) await this.clearOtherDefaults(row.type, row.id)
    return this.toDto(row)
  }

  async update(id: string, dto: UpdateTemplateInput): Promise<TemplateDto> {
    const row = await Template.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (dto.name !== undefined) row.name = dto.name
    if (dto.content !== undefined) row.content = dto.content
    if (dto.isDefault !== undefined) row.isDefault = dto.isDefault
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
    const pageRow = await Page.query()
      .where((q) =>
        q
          .where('layout_id', id)
          .orWhere('header_template_id', id)
          .orWhere('footer_template_id', id)
      )
      .whereNull('deleted_at')
      .count('* as total')
    const pages = Number((pageRow[0] as any)?.$extras?.total ?? 0)

    const templateRow = await Template.query()
      .whereNot('id', id)
      .whereNull('deleted_at')
      .whereRaw('content::text like ?', [`%"templateId":"${id}"%`])
      .count('* as total')
    const templates = Number((templateRow[0] as any)?.$extras?.total ?? 0)

    return { pages, templates, total: pages + templates }
  }

  async duplicate(id: string): Promise<TemplateDto> {
    const source = await Template.query().where('id', id).whereNull('deleted_at').firstOrFail()
    const row = await Template.create({
      id: newUlid(),
      name: `${source.name} (copy)`,
      type: source.type,
      content: source.content,
      isDefault: false,
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

  private toSummary(row: Template): TemplateSummaryDto {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  private toDto(row: Template): TemplateDto {
    return { ...this.toSummary(row), content: row.content }
  }
}
