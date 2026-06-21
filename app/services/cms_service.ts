import db from '@adonisjs/lucid/services/db'
import dbConfig from '#config/database'
import CmsCollection from '#models/cms_collection'
import CmsField from '#models/cms_field'
import CmsRevision from '#models/cms_revision'
import { newUlid } from '#services/ulid_service'
import CmsPermissionsService from '#services/cms_permissions_service'
import {
  nativeFieldColumn,
  nativeTableName,
} from '#cms/native_registry'

export type CmsFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'BOOL'
  | 'DATE'
  | 'DATETIME'
  | 'SELECT'
  | 'RICHTEXT'
  | 'MEDIA'
  | 'SLUG'
  | 'JSON'
  | 'REPEATABLE'

interface FieldDescriptor {
  sqlType: string
  allowsUnique: boolean
  allowsIndex: boolean
}

function isPostgres(): boolean {
  const connection = dbConfig.connection
  const client = dbConfig.connections[connection]?.client
  return client === 'pg'
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function pgFieldRegistry(): Record<CmsFieldType, FieldDescriptor> {
  const pg = isPostgres()
  return {
    TEXT: { sqlType: 'TEXT', allowsUnique: true, allowsIndex: true },
    TEXTAREA: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: false },
    NUMBER: { sqlType: pg ? 'DOUBLE PRECISION' : 'REAL', allowsUnique: true, allowsIndex: true },
    BOOL: { sqlType: pg ? 'BOOLEAN' : 'INTEGER', allowsUnique: false, allowsIndex: false },
    DATE: { sqlType: pg ? 'DATE' : 'TEXT', allowsUnique: false, allowsIndex: true },
    DATETIME: { sqlType: pg ? 'TIMESTAMPTZ' : 'TEXT', allowsUnique: false, allowsIndex: true },
    SELECT: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: true },
    RICHTEXT: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: false },
    MEDIA: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: true },
    SLUG: { sqlType: 'TEXT', allowsUnique: true, allowsIndex: true },
    JSON: { sqlType: pg ? 'JSONB' : 'TEXT', allowsUnique: false, allowsIndex: false },
    REPEATABLE: { sqlType: pg ? 'JSONB' : 'TEXT', allowsUnique: false, allowsIndex: false },
  }
}

function timestampSqlType(): string {
  return isPostgres() ? 'TIMESTAMPTZ' : 'TEXT'
}

const FIELD_REGISTRY = pgFieldRegistry()

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const RESERVED = new Set([
  'select', 'from', 'where', 'table', 'insert', 'update', 'delete', 'user',
  'role', 'order', 'group', 'union', 'join', 'index', 'primary', 'foreign',
  'constraint', 'default', 'null', 'true', 'false', 'status', 'id',
  'created_at', 'updated_at', 'author_id', 'deleted_at',
])

function assertValidKey(value: string, kind: string): void {
  if (!KEY_PATTERN.test(value)) throw new Error(`Invalid ${kind} key "${value}"`)
  if (RESERVED.has(value)) throw new Error(`"${value}" is a reserved identifier`)
}

function dynamicTableName(key: string): string {
  return `cms_${key}`
}

export interface CmsCollectionDto {
  id: string
  key: string
  label: string
  icon: string | null
  group: string | null
  source: string
  modelName?: string | null
  tableName?: string | null
  listConfig?: Record<string, unknown>
  revisionsOn: boolean
  draftsOn: boolean
  fields: CmsFieldDto[]
  createdAt: string
  updatedAt: string
}

export interface CmsFieldDto {
  id: string
  collectionId: string
  key: string
  label: string
  type: string
  required: boolean
  unique: boolean
  order: number
  config: Record<string, unknown>
}

export interface CmsRecordDto {
  id: string
  status: string
  authorId: string | null
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export default class CmsService {
  private permissions = new CmsPermissionsService()

  // ── Collections ──────────────────────────────────────────────────────────

  async listCollections(): Promise<CmsCollectionDto[]> {
    const rows = await CmsCollection.query()
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .orderBy('label')
    return rows.map((r) => this.collectionToDto(r))
  }

  async findCollection(key: string): Promise<CmsCollectionDto> {
    const row = await CmsCollection.query()
      .where('key', key)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .firstOrFail()
    return this.collectionToDto(row)
  }

  async createCollection(dto: {
    key: string
    label: string
    icon?: string
    group?: string
    revisionsOn?: boolean
    draftsOn?: boolean
    fields?: Array<{ key: string; label: string; type: CmsFieldType; required?: boolean; unique?: boolean; config?: Record<string, unknown> }>
  }): Promise<CmsCollectionDto> {
    assertValidKey(dto.key, 'collection')

    const existing = await CmsCollection.query().where('key', dto.key).whereNull('deleted_at').first()
    if (existing) throw new Error(`Collection "${dto.key}" already exists`)

    const collection = await CmsCollection.create({
      id: newUlid(),
      key: dto.key,
      label: dto.label,
      icon: dto.icon ?? null,
      group: dto.group ?? null,
      source: 'DYNAMIC',
      tableName: dynamicTableName(dto.key),
      listConfig: {},
      revisionsOn: dto.revisionsOn ?? true,
      draftsOn: dto.draftsOn ?? true,
    })

    const fields: CmsField[] = []
    if (dto.fields?.length) {
      for (let i = 0; i < dto.fields.length; i++) {
        const f = dto.fields[i]!
        assertValidKey(f.key, 'field')
        const desc = FIELD_REGISTRY[f.type]
        if (!desc) throw new Error(`Unknown field type "${f.type}"`)
        const field = await CmsField.create({
          id: newUlid(),
          collectionId: collection.id,
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required ?? false,
          unique: f.unique ?? false,
          order: i,
          config: f.config ?? {},
        })
        fields.push(field)
      }
    }

    await this.createDynamicTable(dto.key, fields)
    await this.permissions.mintForCollection(dto.key)
    await collection.load('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
    return this.collectionToDto(collection)
  }

  async updateCollection(
    key: string,
    dto: { label?: string; icon?: string; group?: string; revisionsOn?: boolean; draftsOn?: boolean }
  ): Promise<CmsCollectionDto> {
    const collection = await CmsCollection.query()
      .where('key', key)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .firstOrFail()

    if (collection.source !== 'DYNAMIC') throw new Error('Native collections are read-only')

    if (dto.label !== undefined) collection.label = dto.label
    if (dto.icon !== undefined) collection.icon = dto.icon ?? null
    if (dto.group !== undefined) collection.group = dto.group ?? null
    if (dto.revisionsOn !== undefined) collection.revisionsOn = dto.revisionsOn
    if (dto.draftsOn !== undefined) collection.draftsOn = dto.draftsOn
    await collection.save()

    return this.collectionToDto(collection)
  }

  async deleteCollection(key: string): Promise<void> {
    const collection = await CmsCollection.query()
      .where('key', key)
      .whereNull('deleted_at')
      .firstOrFail()

    if (collection.source !== 'DYNAMIC') throw new Error('Native collections cannot be deleted')

    // Soft delete only — the dynamic table and permissions are kept so the
    // collection can be restored from the Trash. They are dropped on force-delete.
    collection.deletedAt = new Date() as any
    await collection.save()
  }

  /** Soft-deleted collections (the Trash). */
  async listTrashedCollections(): Promise<CmsCollectionDto[]> {
    const rows = await CmsCollection.query()
      .whereNotNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .orderBy('label')
    return rows.map((r) => this.collectionToDto(r))
  }

  async restoreCollection(key: string): Promise<CmsCollectionDto> {
    const collection = await CmsCollection.query()
      .where('key', key)
      .whereNotNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .firstOrFail()

    const clash = await CmsCollection.query().where('key', key).whereNull('deleted_at').first()
    if (clash) throw new Error(`A collection with key "${key}" already exists`)

    collection.deletedAt = null as any
    await collection.save()
    await this.permissions.mintForCollection(key)
    return this.collectionToDto(collection)
  }

  /** Permanently delete a trashed collection: drop its dynamic table + permissions. */
  async forceDeleteCollection(key: string): Promise<void> {
    const collection = await CmsCollection.query()
      .where('key', key)
      .whereNotNull('deleted_at')
      .firstOrFail()

    try {
      await db.rawQuery(`DROP TABLE IF EXISTS "${dynamicTableName(key)}"`)
    } catch {}
    await this.permissions.removeForCollection(key)
    await collection.delete()
  }

  async updateField(
    collectionKey: string,
    fieldKey: string,
    dto: { label?: string; config?: Record<string, unknown> }
  ): Promise<CmsFieldDto> {
    const collection = await CmsCollection.query()
      .where('key', collectionKey)
      .whereNull('deleted_at')
      .firstOrFail()

    if (collection.source !== 'DYNAMIC') throw new Error('Native collections are read-only')

    const field = await CmsField.query()
      .where('collection_id', collection.id)
      .where('key', fieldKey)
      .whereNull('deleted_at')
      .firstOrFail()

    if (dto.label !== undefined) field.label = dto.label
    if (dto.config !== undefined) field.config = dto.config
    await field.save()
    return this.fieldToDto(field)
  }

  async reorderFields(collectionKey: string, fieldKeys: string[]): Promise<CmsFieldDto[]> {
    const collection = await CmsCollection.query()
      .where('key', collectionKey)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at'))
      .firstOrFail()

    if (collection.source !== 'DYNAMIC') throw new Error('Native collections are read-only')

    for (let i = 0; i < fieldKeys.length; i++) {
      const key = fieldKeys[i]!
      const field = collection.fields.find((f) => f.key === key)
      if (field) {
        field.order = i
        await field.save()
      }
    }

    const updated = await CmsField.query()
      .where('collection_id', collection.id)
      .whereNull('deleted_at')
      .orderBy('order')
    return updated.map((f) => this.fieldToDto(f))
  }

  async addField(
    collectionKey: string,
    dto: { key: string; label: string; type: CmsFieldType; required?: boolean; unique?: boolean; config?: Record<string, unknown> }
  ): Promise<CmsFieldDto> {
    assertValidKey(dto.key, 'field')

    const collection = await CmsCollection.query()
      .where('key', collectionKey)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at'))
      .firstOrFail()

    if (collection.source !== 'DYNAMIC') throw new Error('Native collections are read-only')

    const existing = collection.fields.find((f) => f.key === dto.key)
    if (existing) throw new Error(`Field "${dto.key}" already exists`)

    if (dto.required) throw new Error('Fields added to existing collections must be optional')

    const desc = FIELD_REGISTRY[dto.type]
    if (!desc) throw new Error(`Unknown field type "${dto.type}"`)

    const order = collection.fields.length
    const field = await CmsField.create({
      id: newUlid(),
      collectionId: collection.id,
      key: dto.key,
      label: dto.label,
      type: dto.type,
      required: false,
      unique: dto.unique ?? false,
      order,
      config: dto.config ?? {},
    })

    await db.rawQuery(
      `ALTER TABLE "${dynamicTableName(collectionKey)}" ADD COLUMN "${dto.key}" ${desc.sqlType} NULL`
    )

    return this.fieldToDto(field)
  }

  async deleteField(collectionKey: string, fieldKey: string): Promise<void> {
    const collection = await CmsCollection.query()
      .where('key', collectionKey)
      .whereNull('deleted_at')
      .firstOrFail()

    if (collection.source !== 'DYNAMIC') throw new Error('Native collections are read-only')

    const field = await CmsField.query()
      .where('collection_id', collection.id)
      .where('key', fieldKey)
      .whereNull('deleted_at')
      .firstOrFail()

    field.deletedAt = new Date() as any
    await field.save()
  }

  // ── Records ───────────────────────────────────────────────────────────────

  async listRecords(
    collectionKey: string,
    query: { page?: number; pageSize?: number; status?: string; search?: string }
  ): Promise<{ items: CmsRecordDto[]; page: number; pageSize: number; total: number; totalPages: number }> {
    const { table, collection } = await this.resolveRecordContext(collectionKey)
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20))
    const offset = (page - 1) * pageSize

    let baseQuery = db.from(table).whereNull('deleted_at')
    if (query.status) baseQuery = baseQuery.where('status', query.status)

    const countResult = await baseQuery.clone().count('* as total')
    const total = Number((countResult[0] as any)?.total ?? 0)

    const rows = await baseQuery
      .select('*')
      .orderBy(this.orderColumnForTable(table), 'desc')
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map((r: any) => this.rowToRecordDto(r, collection)),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    }
  }

  async findRecord(collectionKey: string, id: string): Promise<CmsRecordDto> {
    const { table, collection } = await this.resolveRecordContext(collectionKey)
    const row = await db.from(table).where('id', id).whereNull('deleted_at').first()
    if (!row) throw new Error('Record not found')
    return this.rowToRecordDto(row, collection)
  }

  async createRecord(
    collectionKey: string,
    authorId: number | null,
    dto: { data: Record<string, unknown>; status?: string }
  ): Promise<CmsRecordDto> {
    const collection = await CmsCollection.query()
      .where('key', collectionKey)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at'))
      .firstOrFail()

    if (collection.source === 'PRISMA' && collectionKey === 'user') {
      throw new Error('User records must be created via Admin → Users')
    }

    const table = this.tableForCollection(collection)
    const id = collectionKey === 'user' ? undefined : newUlid()
    const data = this.prepareRecordData(collection, dto.data)
    const status =
      (typeof dto.status === 'string' && dto.status) ||
      (typeof data.status === 'string' && data.status) ||
      (collection.draftsOn ? 'DRAFT' : 'PUBLISHED')
    const now = new Date().toISOString()

    if (collectionKey === 'content') {
      await this.assertContentSlugAvailable(String(data.slug ?? ''), undefined)
    }

    const payload: Record<string, unknown> = {
      status,
      created_at: now,
      updated_at: now,
    }

    if (id !== undefined) {
      payload.id = id
    }

    if (this.tableHasAuthorId(table)) {
      payload.author_id = this.tableUsesIntegerAuthorId(table)
        ? authorId
        : (authorId?.toString() ?? null)
    }

    for (const field of collection.fields) {
      const col = this.fieldToColumn(collection, field.key)
      if (col === 'status') continue
      this.ensureSlugValue(field, data)
      const val = data[field.key]
      payload[col] = this.serializeFieldValue(field.type, val)
    }

    try {
      await db.table(table).insert(payload)
    } catch (e) {
      throw this.rethrowDbError(e)
    }

    const insertedId = id ?? (await db.from(table).orderBy('id', 'desc').select('id').first())?.id
    if (!insertedId) throw new Error('Failed to create record')

    if (collection.revisionsOn) {
      await CmsRevision.create({
        id: newUlid(),
        collectionKey,
        recordId: String(insertedId),
        data,
        status: status as 'DRAFT' | 'PUBLISHED',
        authorId,
      })
    }

    const row = await db.from(table).where('id', insertedId).first()
    return this.rowToRecordDto(row, collection)
  }

  async updateRecord(
    collectionKey: string,
    id: string,
    authorId: number | null,
    dto: { data?: Record<string, unknown>; status?: string }
  ): Promise<CmsRecordDto> {
    const collection = await CmsCollection.query()
      .where('key', collectionKey)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at'))
      .firstOrFail()

    if (collection.source === 'PRISMA' && collectionKey === 'user') {
      throw new Error('User records must be updated via Admin → Users')
    }

    const table = this.tableForCollection(collection)
    const existing = await db.from(table).where('id', id).whereNull('deleted_at').first()
    if (!existing) throw new Error('Record not found')

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (dto.status !== undefined) payload['status'] = dto.status

    if (dto.data) {
      const data = this.prepareRecordData(collection, dto.data, { partial: true })
      if (collectionKey === 'content' && data.slug !== undefined) {
        await this.assertContentSlugAvailable(String(data.slug), id)
      }
      for (const field of collection.fields) {
        if (!(field.key in data)) continue
        const col = this.fieldToColumn(collection, field.key)
        if (col === 'status') continue
        this.ensureSlugValue(field, data)
        payload[col] = this.serializeFieldValue(field.type, data[field.key])
      }
    }

    try {
      await db.from(table).where('id', id).update(payload)
    } catch (e) {
      throw this.rethrowDbError(e)
    }

    if (collection.revisionsOn) {
      const updated = await db.from(table).where('id', id).first()
      const fieldData: Record<string, unknown> = {}
      for (const field of collection.fields) {
        const col = this.fieldToColumn(collection, field.key)
        fieldData[field.key] = updated?.[col] ?? null
      }
      await CmsRevision.create({
        id: newUlid(),
        collectionKey,
        recordId: id,
        data: fieldData,
        status: (updated?.status ?? 'DRAFT') as 'DRAFT' | 'PUBLISHED',
        authorId,
      })
    }

    const row = await db.from(table).where('id', id).first()
    return this.rowToRecordDto(row, collection)
  }

  async deleteRecord(collectionKey: string, id: string): Promise<void> {
    const { table, collection } = await this.resolveRecordContext(collectionKey)
    if (collection.source === 'PRISMA' && collectionKey === 'user') {
      throw new Error('User records must be deleted via Admin → Users')
    }
    await db.from(table).where('id', id).update({ deleted_at: new Date().toISOString() })
  }

  /** Soft-deleted records for a collection (the Trash). */
  async listTrashedRecords(collectionKey: string): Promise<CmsRecordDto[]> {
    const { table, collection } = await this.resolveRecordContext(collectionKey)
    const rows = await db
      .from(table)
      .whereNotNull('deleted_at')
      .select('*')
      .orderBy(this.orderColumnForTable(table), 'desc')
    return rows.map((r: any) => this.rowToRecordDto(r, collection))
  }

  async restoreRecord(collectionKey: string, id: string): Promise<CmsRecordDto> {
    const { table, collection } = await this.resolveRecordContext(collectionKey)
    await db.from(table).where('id', id).update({ deleted_at: null })
    const row = await db.from(table).where('id', id).first()
    if (!row) throw new Error('Record not found')
    return this.rowToRecordDto(row, collection)
  }

  async forceDeleteRecord(collectionKey: string, id: string): Promise<void> {
    const { table } = await this.resolveRecordContext(collectionKey)
    await db.from(table).where('id', id).delete()
  }

  async getRevisions(collectionKey: string, recordId: string): Promise<CmsRevision[]> {
    return CmsRevision.query()
      .where('collection_key', collectionKey)
      .where('record_id', recordId)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
      .limit(50)
  }

  async restoreRevision(
    collectionKey: string,
    recordId: string,
    revisionId: string,
    authorId: number | null
  ): Promise<CmsRecordDto> {
    const revision = await CmsRevision.query()
      .where('id', revisionId)
      .where('collection_key', collectionKey)
      .where('record_id', recordId)
      .whereNull('deleted_at')
      .firstOrFail()

    const data = typeof revision.data === 'string' ? JSON.parse(revision.data) : revision.data
    return this.updateRecord(collectionKey, recordId, authorId, {
      data: data as Record<string, unknown>,
      status: revision.status,
    })
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async resolveRecordContext(collectionKey: string): Promise<{
    table: string
    collection: CmsCollection
  }> {
    const collection = await CmsCollection.query()
      .where('key', collectionKey)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .firstOrFail()
    return { table: this.tableForCollection(collection), collection }
  }

  private tableForCollection(collection: CmsCollection): string {
    if (collection.tableName) return collection.tableName
    const native = nativeTableName(collection.key)
    if (collection.source === 'PRISMA' && native) return native
    return dynamicTableName(collection.key)
  }

  private fieldToColumn(collection: CmsCollection, fieldKey: string): string {
    if (collection.source === 'PRISMA') {
      return nativeFieldColumn(collection.key, fieldKey)
    }
    return fieldKey
  }

  private tableHasAuthorId(table: string): boolean {
    return table !== 'users'
  }

  private tableUsesIntegerAuthorId(table: string): boolean {
    return table === 'contents' || table === 'media'
  }

  private orderColumnForTable(table: string): string {
    if (table === 'media') return 'created_at'
    return 'updated_at'
  }

  private async createDynamicTable(key: string, fields: CmsField[]): Promise<void> {
    const table = dynamicTableName(key)
    const cols: string[] = [
      '"id" TEXT NOT NULL PRIMARY KEY',
      '"status" TEXT NOT NULL DEFAULT \'DRAFT\'',
      '"author_id" TEXT NULL',
    ]

    for (const f of fields) {
      const desc = FIELD_REGISTRY[f.type as CmsFieldType]
      if (!desc) continue
      const notNull = f.required ? ' NOT NULL' : ' NULL'
      const uniqueClause = f.unique && desc.allowsUnique ? ' UNIQUE' : ''
      cols.push(`"${f.key}" ${desc.sqlType}${notNull}${uniqueClause}`)
    }

    cols.push(
      `"created_at" ${timestampSqlType()} NOT NULL`,
      `"updated_at" ${timestampSqlType()} NOT NULL`,
      `"deleted_at" ${timestampSqlType()} NULL`
    )

    await db.rawQuery(`CREATE TABLE IF NOT EXISTS "${table}" (${cols.join(', ')})`)
  }

  private isSlugField(field: CmsField): boolean {
    return field.type === 'SLUG' || field.key === 'slug'
  }

  private ensureSlugValue(field: CmsField, data: Record<string, unknown>): void {
    if (!this.isSlugField(field)) return

    const raw = data[field.key]
    const str = typeof raw === 'string' ? raw.trim() : ''
    if (str) {
      data[field.key] = slugify(str)
      return
    }

    const sourceKey = String((field.config as { source?: string })?.source ?? 'title')
    const source = data[sourceKey]
    if (typeof source === 'string' && source.trim()) {
      data[field.key] = slugify(source)
    }
  }

  private prepareRecordData(
    collection: CmsCollection,
    data: Record<string, unknown>,
    opts?: { partial?: boolean }
  ): Record<string, unknown> {
    const out = { ...data }

    for (const field of collection.fields) {
      if (this.isSlugField(field)) {
        this.ensureSlugValue(field, out)
      }

      if (opts?.partial) continue

      if (!field.required) continue
      const v = out[field.key]
      if (v === undefined || v === null) {
        throw new Error(`${field.label} is required`)
      }
      if (typeof v === 'string' && !v.trim()) {
        throw new Error(`${field.label} is required`)
      }
    }

    return out
  }

  private rethrowDbError(e: unknown): Error {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('null value in column "slug"')) {
      return new Error('Slug is required — enter a slug or fill in the title first')
    }
    if (msg.includes('duplicate key') && msg.includes('slug')) {
      return new Error('Slug already in use')
    }
    return e instanceof Error ? e : new Error(msg)
  }

  private async assertContentSlugAvailable(slug: string, excludeId?: string): Promise<void> {
    if (!slug) throw new Error('Slug is required')
    let q = db.from('contents').where('slug', slug).whereNull('deleted_at')
    if (excludeId) q = q.whereNot('id', excludeId)
    const existing = await q.first()
    if (existing) throw new Error('Slug already in use')
  }

  private serializeFieldValue(type: string, val: unknown): unknown {
    if (val === undefined || val === null) return null
    if (type === 'JSON' || type === 'RICHTEXT' || type === 'REPEATABLE') {
      return typeof val === 'string' ? val : JSON.stringify(val)
    }
    if (type === 'BOOL') {
      if (isPostgres()) return Boolean(val)
      return val ? 1 : 0
    }
    return val
  }

  private rowToRecordDto(row: any, collection?: CmsCollection): CmsRecordDto {
    const { id, status, author_id, created_at, updated_at, deleted_at, ...rest } = row
    const data: Record<string, unknown> = {}

    if (collection?.fields?.length) {
      for (const field of collection.fields) {
        const col = this.fieldToColumn(collection, field.key)
        data[field.key] = rest[col] ?? rest[field.key] ?? null
      }
    } else {
      for (const [key, value] of Object.entries(rest)) {
        if (key !== 'deleted_at') data[key] = value
      }
    }

    return {
      id: String(id),
      status: status ?? 'DRAFT',
      authorId: author_id != null ? String(author_id) : null,
      data,
      createdAt: created_at,
      updatedAt: updated_at ?? created_at,
    }
  }

  private collectionToDto(col: CmsCollection): CmsCollectionDto {
    return {
      id: col.id,
      key: col.key,
      label: col.label,
      icon: col.icon,
      group: col.group,
      source: col.source,
      modelName: col.modelName,
      tableName: col.tableName,
      listConfig: col.listConfig ?? {},
      revisionsOn: col.revisionsOn,
      draftsOn: col.draftsOn,
      fields: col.fields?.map((f) => this.fieldToDto(f)) ?? [],
      createdAt: col.createdAt.toISO()!,
      updatedAt: col.updatedAt.toISO()!,
    }
  }

  private fieldToDto(f: CmsField): CmsFieldDto {
    return {
      id: f.id,
      collectionId: f.collectionId,
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      unique: f.unique,
      order: f.order,
      config: f.config,
    }
  }
}
