import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import dbConfig from '#config/database'
import CmsCollection from '#models/cms_collection'
import CmsField from '#models/cms_field'
import CmsComponent, { type CmsComponentField } from '#models/cms_component'
import CmsRevision from '#models/cms_revision'
import { newUlid } from '#services/ulid_service'
import CmsPermissionsService from '#services/cms_permissions_service'
import PagesService from '#services/pages_service'
import { sanitizeRichText } from '#services/html_sanitizer_service'
import { nativeFieldColumn, nativeTableName } from '#cms/native_registry'
import {
  builtinCollection,
  isBuiltinCollectionKey,
  listBuiltinCollections,
} from '#cms/builtin_collections'

export type CmsFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOL'
  | 'DATE'
  | 'DATETIME'
  | 'SELECT'
  | 'EMAIL'
  | 'PASSWORD'
  | 'RICHTEXT'
  | 'MEDIA'
  | 'SLUG'
  | 'JSON'
  | 'REPEATABLE'
  | 'RELATION'
  | 'COMPONENT'

/** Relation cardinalities supported by the CMS. */
export type CmsRelationType = 'manyToOne' | 'oneToOne' | 'manyToMany' | 'oneToMany'

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
    INTEGER: { sqlType: pg ? 'BIGINT' : 'INTEGER', allowsUnique: true, allowsIndex: true },
    DECIMAL: { sqlType: pg ? 'DOUBLE PRECISION' : 'REAL', allowsUnique: true, allowsIndex: true },
    BOOL: { sqlType: pg ? 'BOOLEAN' : 'INTEGER', allowsUnique: false, allowsIndex: false },
    DATE: { sqlType: pg ? 'DATE' : 'TEXT', allowsUnique: false, allowsIndex: true },
    DATETIME: { sqlType: pg ? 'TIMESTAMPTZ' : 'TEXT', allowsUnique: false, allowsIndex: true },
    SELECT: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: true },
    EMAIL: { sqlType: 'TEXT', allowsUnique: true, allowsIndex: true },
    PASSWORD: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: false },
    RICHTEXT: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: false },
    MEDIA: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: true },
    SLUG: { sqlType: 'TEXT', allowsUnique: true, allowsIndex: true },
    JSON: { sqlType: pg ? 'JSONB' : 'TEXT', allowsUnique: false, allowsIndex: false },
    REPEATABLE: { sqlType: pg ? 'JSONB' : 'TEXT', allowsUnique: false, allowsIndex: false },
    // RELATION columns are created with a custom FK clause in addRelationField,
    // not via the generic sqlType path — this descriptor is a placeholder.
    RELATION: { sqlType: 'TEXT', allowsUnique: false, allowsIndex: true },
    // COMPONENT stores its structured value (object or array) as JSON.
    COMPONENT: { sqlType: pg ? 'JSONB' : 'TEXT', allowsUnique: false, allowsIndex: false },
  }
}

function timestampSqlType(): string {
  return isPostgres() ? 'TIMESTAMPTZ' : 'TEXT'
}

const FIELD_REGISTRY = pgFieldRegistry()

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const RESERVED = new Set([
  'select',
  'from',
  'where',
  'table',
  'insert',
  'update',
  'delete',
  'user',
  'role',
  'order',
  'group',
  'union',
  'join',
  'index',
  'primary',
  'foreign',
  'constraint',
  'default',
  'null',
  'true',
  'false',
  'status',
  'id',
  'created_at',
  'updated_at',
  'author_id',
  'deleted_at',
])

function assertValidKey(value: string, kind: string): void {
  if (!KEY_PATTERN.test(value)) throw new Error(`Invalid ${kind} key "${value}"`)
  if (RESERVED.has(value)) throw new Error(`"${value}" is a reserved identifier`)
}

function dynamicTableName(key: string): string {
  return `cms_${key}`
}

/**
 * A short human label for a related record — the first non-empty of
 * title/name/label/slug, else any string field, else the id.
 *
 * Ported from the admin `recordLabel` (`inertia/components/cms/field-renderer.tsx`)
 * so the page renderer can turn a relation's target id into readable text
 * server-side. A deliberate small duplication across the server/client boundary.
 */
function recordLabel(record: CmsRecordDto): string {
  const data = (record.data ?? {}) as Record<string, unknown>
  for (const k of ['title', 'name', 'label', 'slug']) {
    const v = data[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v.trim()) return v
  }
  return record.id
}

/** Join table backing a many-to-many relation field. */
function relationJoinTableName(srcKey: string, fieldKey: string): string {
  return `cms_${srcKey}_${fieldKey}`
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
  kind: 'collection' | 'single'
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

export interface CmsComponentDto {
  id: string
  key: string
  label: string
  icon: string | null
  fields: CmsComponentField[]
  createdAt: string
  updatedAt: string
}

export default class CmsService {
  private permissions = new CmsPermissionsService()

  // ── Components (reusable field groups) ────────────────────────────────────

  async listComponents(): Promise<CmsComponentDto[]> {
    const rows = await CmsComponent.query().whereNull('deleted_at').orderBy('label')
    return rows.map((c) => this.componentToDto(c))
  }

  async findComponent(key: string): Promise<CmsComponentDto> {
    const c = await CmsComponent.query().where('key', key).whereNull('deleted_at').firstOrFail()
    return this.componentToDto(c)
  }

  async createComponent(dto: {
    key: string
    label: string
    icon?: string | null
    fields?: CmsComponentField[]
  }): Promise<CmsComponentDto> {
    assertValidKey(dto.key, 'component')
    const existing = await CmsComponent.query()
      .where('key', dto.key)
      .whereNull('deleted_at')
      .first()
    if (existing) throw new Error(`Component "${dto.key}" already exists`)
    const c = await CmsComponent.create({
      id: newUlid(),
      key: dto.key,
      label: dto.label,
      icon: dto.icon ?? null,
      fields: this.normalizeComponentFields(dto.fields),
    })
    return this.componentToDto(c)
  }

  async updateComponent(
    key: string,
    dto: { label?: string; icon?: string | null; fields?: CmsComponentField[] }
  ): Promise<CmsComponentDto> {
    const c = await CmsComponent.query().where('key', key).whereNull('deleted_at').firstOrFail()
    if (dto.label !== undefined) c.label = dto.label
    if (dto.icon !== undefined) c.icon = dto.icon ?? null
    if (dto.fields !== undefined) c.fields = this.normalizeComponentFields(dto.fields)
    await c.save()
    return this.componentToDto(c)
  }

  async deleteComponent(key: string): Promise<void> {
    const c = await CmsComponent.query().where('key', key).whereNull('deleted_at').firstOrFail()
    // Guard: a component still referenced by a collection field can't be deleted.
    const componentFields = await CmsField.query()
      .where('type', 'COMPONENT')
      .whereNull('deleted_at')
    const inUse = componentFields.some((f) => {
      const cfg = (typeof f.config === 'string' ? JSON.parse(f.config) : f.config) as {
        componentKey?: string
      }
      return cfg?.componentKey === key
    })
    if (inUse) {
      throw new Error('This component is used by a collection field — remove those fields first')
    }
    c.deletedAt = new Date() as any
    await c.save()
  }

  private normalizeComponentFields(fields: CmsComponentField[] | undefined): CmsComponentField[] {
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new Error('A component needs at least one field')
    }
    const seen = new Set<string>()
    const out: CmsComponentField[] = []
    for (const f of fields) {
      const key = typeof f?.key === 'string' ? f.key.trim() : ''
      const label = typeof f?.label === 'string' ? f.label.trim() : ''
      const type = typeof f?.type === 'string' ? f.type : ''
      assertValidKey(key, 'component field')
      if (!label) throw new Error(`Component field "${key}" needs a label`)
      if (!(type in FIELD_REGISTRY)) throw new Error(`Unknown field type "${type}"`)
      if (type === 'RELATION' || type === 'COMPONENT' || type === 'PASSWORD') {
        throw new Error(`Field type "${type}" is not allowed inside a component`)
      }
      if (seen.has(key)) throw new Error(`Duplicate component field key "${key}"`)
      seen.add(key)
      out.push({ key, label, type })
    }
    return out
  }

  private componentToDto(c: CmsComponent): CmsComponentDto {
    return {
      id: c.id,
      key: c.key,
      label: c.label,
      icon: c.icon,
      fields: Array.isArray(c.fields) ? c.fields : [],
      createdAt: c.createdAt.toISO()!,
      updatedAt: c.updatedAt.toISO()!,
    }
  }

  // ── Collections ──────────────────────────────────────────────────────────

  async listCollections(): Promise<CmsCollectionDto[]> {
    const rows = await CmsCollection.query()
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .orderBy('label')
    return rows.map((r) => this.collectionToDto(r))
  }

  /**
   * Everything the page builder may bind to: the built-in collections (posts,
   * products when the store is on) first, then the dynamic CMS collections.
   *
   * Separate from `listCollections()` on purpose — the CMS admin lists only
   * what its generic record editor can write to, and built-ins are read-only
   * here (they have their own admin pages). Ids are synthetic; nothing should
   * try to load a built-in through the CMS collection routes.
   */
  async listBindableCollections(): Promise<CmsCollectionDto[]> {
    const builtins = await listBuiltinCollections()
    const dynamic = await this.listCollections()
    const epoch = new Date(0).toISOString()
    const mapped: CmsCollectionDto[] = builtins.map((b) => ({
      id: `builtin:${b.key}`,
      key: b.key,
      label: b.label,
      icon: b.icon ?? null,
      group: b.group ?? 'Built-in',
      source: 'BUILTIN',
      revisionsOn: false,
      draftsOn: false,
      kind: 'collection',
      fields: b.fields.map((f, i) => ({
        id: `builtin:${b.key}:${f.key}`,
        collectionId: `builtin:${b.key}`,
        key: f.key,
        label: f.label,
        type: f.type,
        required: false,
        unique: false,
        order: i,
        config: {},
      })),
      createdAt: epoch,
      updatedAt: epoch,
    }))
    return [...mapped, ...dynamic]
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
    kind?: 'collection' | 'single'
    fields?: Array<{
      key: string
      label: string
      type: CmsFieldType
      required?: boolean
      unique?: boolean
      config?: Record<string, unknown>
    }>
  }): Promise<CmsCollectionDto> {
    assertValidKey(dto.key, 'collection')
    // `posts` / `products` are answered by their adapters; a dynamic collection
    // under the same key could never be reached from the builder.
    if (isBuiltinCollectionKey(dto.key)) {
      throw new Error(`"${dto.key}" is a built-in collection — pick another key`)
    }

    const existing = await CmsCollection.query()
      .where('key', dto.key)
      .whereNull('deleted_at')
      .first()
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
      kind: dto.kind === 'single' ? 'single' : 'collection',
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
    dto: {
      label?: string
      icon?: string
      group?: string
      revisionsOn?: boolean
      draftsOn?: boolean
      kind?: 'collection' | 'single'
    }
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
    if (dto.kind !== undefined) {
      collection.kind = dto.kind === 'single' ? 'single' : 'collection'
    }
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
    dto: {
      key: string
      label: string
      type: CmsFieldType
      required?: boolean
      unique?: boolean
      config?: Record<string, unknown>
    }
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

    if (dto.type === 'RELATION') {
      return this.addRelationField(collection, dto, order)
    }

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

  private parseRelationConfig(config: Record<string, unknown> | undefined): {
    targetKey: string
    relationType: CmsRelationType
  } {
    const targetKey = typeof config?.targetKey === 'string' ? config.targetKey.trim() : ''
    if (!targetKey) throw new Error('Relation requires a target collection')
    const rt = config?.relationType
    const relationType: CmsRelationType =
      rt === 'oneToOne' || rt === 'manyToMany' || rt === 'oneToMany' ? rt : 'manyToOne'
    return { targetKey, relationType }
  }

  /**
   * Add a relation field. Each cardinality maps to its own storage:
   * - manyToOne / oneToOne → a single FK column on the source row,
   * - manyToMany → a `cms_<src>_<key>` join table,
   * - oneToMany → an inverse FK column on the target table.
   * The CmsField row + the DDL commit together in a transaction.
   */
  private async addRelationField(
    collection: CmsCollection,
    dto: { key: string; label: string; config?: Record<string, unknown> },
    order: number
  ): Promise<CmsFieldDto> {
    const rel = this.parseRelationConfig(dto.config)

    const target = await CmsCollection.query()
      .where('key', rel.targetKey)
      .whereNull('deleted_at')
      .first()
    if (!target) throw new Error(`Relation target "${rel.targetKey}" does not exist`)
    if (target.source !== 'DYNAMIC') {
      throw new Error('Relations can only target dynamic collections')
    }

    const srcTable = dynamicTableName(collection.key)
    const targetTable = dynamicTableName(target.key)

    const config: Record<string, unknown> = {
      targetKey: rel.targetKey,
      relationType: rel.relationType,
    }
    let ddl: string

    if (rel.relationType === 'manyToMany') {
      const joinTable = relationJoinTableName(collection.key, dto.key)
      config.joinTable = joinTable
      ddl =
        `CREATE TABLE IF NOT EXISTS "${joinTable}" (` +
        `"source_id" TEXT NOT NULL REFERENCES "${srcTable}" ("id") ON DELETE CASCADE, ` +
        `"target_id" TEXT NOT NULL REFERENCES "${targetTable}" ("id") ON DELETE CASCADE, ` +
        `PRIMARY KEY ("source_id", "target_id"))`
    } else if (rel.relationType === 'oneToMany') {
      // The "many" side (target) holds the FK back to this record.
      const inverseColumn = `${collection.key}_${dto.key}`
      if (inverseColumn.length > 63) {
        throw new Error('Relation key is too long for a one-to-many column')
      }
      config.inverseColumn = inverseColumn
      ddl =
        `ALTER TABLE "${targetTable}" ADD COLUMN "${inverseColumn}" TEXT NULL ` +
        `REFERENCES "${srcTable}" ("id") ON DELETE SET NULL`
    } else {
      // manyToOne / oneToOne: a single FK column on the source row.
      const uniqueClause = rel.relationType === 'oneToOne' ? ' UNIQUE' : ''
      ddl =
        `ALTER TABLE "${srcTable}" ADD COLUMN "${dto.key}" TEXT NULL${uniqueClause} ` +
        `REFERENCES "${targetTable}" ("id") ON DELETE SET NULL`
    }

    const trx = await db.transaction()
    try {
      const field = await CmsField.create(
        {
          id: newUlid(),
          collectionId: collection.id,
          key: dto.key,
          label: dto.label,
          type: 'RELATION',
          required: false,
          unique: rel.relationType === 'oneToOne',
          order,
          config,
        },
        { client: trx }
      )
      await trx.rawQuery(ddl)
      await trx.commit()
      return this.fieldToDto(field)
    } catch (e) {
      await trx.rollback()
      throw e
    }
  }

  /** A relation whose value is a list, stored outside the record row. */
  private isMultiRelation(field: CmsField): boolean {
    if (field.type !== 'RELATION') return false
    const rt = (field.config as { relationType?: string })?.relationType
    return rt === 'manyToMany' || rt === 'oneToMany'
  }

  /**
   * Fill `data[fieldKey]` with related ids (raw id arrays) for every
   * many-to-many / one-to-many field on the given record DTOs.
   */
  private async resolveMultiRelations(
    collection: CmsCollection,
    dtos: CmsRecordDto[]
  ): Promise<void> {
    if (!dtos.length) return
    const relFields = collection.fields.filter((f) => this.isMultiRelation(f))
    if (!relFields.length) return

    const ids = dtos.map((d) => d.id)
    for (const field of relFields) {
      const cfg = field.config as {
        relationType?: string
        joinTable?: string
        inverseColumn?: string
        targetKey?: string
      }
      const map = new Map<string, string[]>()

      if (cfg.relationType === 'manyToMany') {
        const joinTable = cfg.joinTable ?? relationJoinTableName(collection.key, field.key)
        const rows = await db
          .from(joinTable)
          .whereIn('source_id', ids)
          .select('source_id', 'target_id')
        for (const r of rows) {
          const src = String(r.source_id)
          const arr = map.get(src) ?? []
          arr.push(String(r.target_id))
          map.set(src, arr)
        }
      } else {
        const targetTable = dynamicTableName(cfg.targetKey ?? '')
        const col = cfg.inverseColumn ?? `${collection.key}_${field.key}`
        const rows = await db
          .from(targetTable)
          .whereIn(col, ids)
          .whereNull('deleted_at')
          .select('id', col)
        for (const r of rows) {
          const src = String(r[col])
          const arr = map.get(src) ?? []
          arr.push(String(r.id))
          map.set(src, arr)
        }
      }

      for (const d of dtos) d.data[field.key] = map.get(d.id) ?? []
    }
  }

  /**
   * Persist many-to-many / one-to-many selections for a record. Only fields
   * present in `data` are touched, so partial updates leave others intact.
   */
  private async syncMultiRelations(
    collection: CmsCollection,
    recordId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const relFields = collection.fields.filter((f) => this.isMultiRelation(f))
    for (const field of relFields) {
      if (!(field.key in data)) continue
      const raw = data[field.key]
      const targetIds = Array.isArray(raw)
        ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
        : []
      const cfg = field.config as {
        relationType?: string
        joinTable?: string
        inverseColumn?: string
        targetKey?: string
      }

      if (cfg.relationType === 'manyToMany') {
        const joinTable = cfg.joinTable ?? relationJoinTableName(collection.key, field.key)
        await db.from(joinTable).where('source_id', recordId).delete()
        if (targetIds.length) {
          await db
            .table(joinTable)
            .multiInsert(targetIds.map((t) => ({ source_id: recordId, target_id: t })))
        }
      } else {
        // oneToMany: repoint the target rows' inverse FK to this record.
        const targetTable = dynamicTableName(cfg.targetKey ?? '')
        const col = cfg.inverseColumn ?? `${collection.key}_${field.key}`
        await db
          .from(targetTable)
          .where(col, recordId)
          .update({ [col]: null })
        if (targetIds.length) {
          await db
            .from(targetTable)
            .whereIn('id', targetIds)
            .update({ [col]: recordId })
        }
      }
    }
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

    if (field.type === 'RELATION') {
      // Relations own real schema (FK column, join table, or inverse FK) — drop
      // it for real so a dangling constraint can't block future changes.
      const cfg = (field.config ?? {}) as {
        relationType?: string
        joinTable?: string
        inverseColumn?: string
        targetKey?: string
      }
      let ddl: string
      if (cfg.relationType === 'manyToMany') {
        const joinTable = cfg.joinTable ?? relationJoinTableName(collectionKey, fieldKey)
        ddl = `DROP TABLE IF EXISTS "${joinTable}"`
      } else if (cfg.relationType === 'oneToMany') {
        const targetTable = dynamicTableName(cfg.targetKey ?? '')
        const inverseColumn = cfg.inverseColumn ?? `${collectionKey}_${fieldKey}`
        ddl = `ALTER TABLE "${targetTable}" DROP COLUMN IF EXISTS "${inverseColumn}"`
      } else {
        ddl = `ALTER TABLE "${dynamicTableName(collectionKey)}" DROP COLUMN IF EXISTS "${fieldKey}"`
      }

      const trx = await db.transaction()
      try {
        field.deletedAt = new Date() as any
        field.useTransaction(trx)
        await field.save()
        await trx.rawQuery(ddl)
        await trx.commit()
      } catch (e) {
        await trx.rollback()
        throw e
      }
      return
    }

    field.deletedAt = new Date() as any
    await field.save()
  }

  // ── Records ───────────────────────────────────────────────────────────────

  async listRecords(
    collectionKey: string,
    query: {
      page?: number
      pageSize?: number
      status?: string
      search?: string
      /** Substring filter on one field (whitelisted against the collection's fields). */
      filterField?: string
      filterValue?: string
      /** Sort by a field key, or `created_at`/`updated_at`; defaults to the table's own. */
      sortField?: string
      sortDir?: 'asc' | 'desc'
    },
    /**
     * Public render paths pass `resolveRelations: true` to swap each RELATION
     * field's raw target id(s) for the target record's display label. Left
     * `false` for the admin editor and the external v1 API, which both need the
     * raw ids (editing writes them back; the v1 DTO is a stable contract).
     */
    opts?: { resolveRelations?: boolean }
  ): Promise<{
    items: CmsRecordDto[]
    page: number
    pageSize: number
    total: number
    totalPages: number
  }> {
    /**
     * Built-in collections (posts, a module's products) answer from their own
     * adapter. They only ever expose published rows, so a `status` other than
     * PUBLISHED — an admin listing drafts — finds nothing there, by design.
     */
    const builtin = await builtinCollection(collectionKey)
    if (builtin) {
      if (query.status && query.status !== 'PUBLISHED') {
        return {
          items: [],
          page: 1,
          pageSize: Number(query.pageSize) || 20,
          total: 0,
          totalPages: 0,
        }
      }
      return builtin.list({
        page: Number(query.page) || 1,
        pageSize: Number(query.pageSize) || 20,
        search: query.search,
        filterField: query.filterField,
        filterValue: query.filterValue,
        sortField: query.sortField,
        sortDir: query.sortDir,
      })
    }

    const { table, collection } = await this.resolveRecordContext(collectionKey)
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20))
    const offset = (page - 1) * pageSize

    // Only real field keys may be referenced in filter/sort — never raw input.
    const fieldKeys = new Set(collection.fields.map((f) => f.key))
    const safeCol = (c: string) => /^[a-zA-Z0-9_]+$/.test(c)

    let baseQuery = db.from(table).whereNull('deleted_at')
    if (query.status) baseQuery = baseQuery.where('status', query.status)

    // Field filter (case-insensitive substring), dialect-safe.
    const ff = query.filterField?.trim()
    const fv = query.filterValue?.trim()
    if (ff && fv && fieldKeys.has(ff)) {
      const col = this.fieldToColumn(collection, ff)
      if (safeCol(col))
        baseQuery = baseQuery.whereRaw(`LOWER("${col}") LIKE ?`, [`%${fv.toLowerCase()}%`])
    }

    // Cross-field text search across the collection's text-like columns.
    const search = query.search?.trim()
    if (search) {
      const textCols = collection.fields
        .filter((f) => ['TEXT', 'TEXTAREA', 'RICHTEXT', 'SLUG', 'STRING'].includes(String(f.type)))
        .map((f) => this.fieldToColumn(collection, f.key))
        .filter(safeCol)
      if (textCols.length) {
        const like = `%${search.toLowerCase()}%`
        baseQuery = baseQuery.where((b: any) => {
          for (const col of textCols) b.orWhereRaw(`LOWER("${col}") LIKE ?`, [like])
        })
      }
    }

    const countResult = await baseQuery.clone().count('* as total')
    const total = Number((countResult[0] as any)?.total ?? 0)

    // Sort: a whitelisted field or timestamp, else the table's default.
    let sortCol = this.orderColumnForTable(table)
    let sortDir: 'asc' | 'desc' = 'desc'
    const sf = query.sortField?.trim()
    if (sf === 'created_at' || sf === 'updated_at') {
      sortCol = sf
      sortDir = query.sortDir === 'asc' ? 'asc' : 'desc'
    } else if (sf && fieldKeys.has(sf)) {
      const col = this.fieldToColumn(collection, sf)
      if (safeCol(col)) {
        sortCol = col
        sortDir = query.sortDir === 'asc' ? 'asc' : 'desc'
      }
    }

    const rows = await baseQuery
      .select('*')
      .orderBy(sortCol, sortDir)
      .limit(pageSize)
      .offset(offset)

    const items = rows.map((r: any) => this.rowToRecordDto(r, collection))
    await this.resolveMultiRelations(collection, items)
    if (opts?.resolveRelations) await this.resolveRelationLabels(collection, items)
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    }
  }

  async findRecord(
    collectionKey: string,
    id: string,
    opts?: { resolveRelations?: boolean }
  ): Promise<CmsRecordDto> {
    const builtin = await builtinCollection(collectionKey)
    if (builtin) {
      const record = await builtin.find(id)
      if (!record) throw new Error('Record not found')
      return record
    }

    const { table, collection } = await this.resolveRecordContext(collectionKey)
    const row = await db.from(table).where('id', id).whereNull('deleted_at').first()
    if (!row) throw new Error('Record not found')
    const dto = this.rowToRecordDto(row, collection)
    await this.resolveMultiRelations(collection, [dto])
    if (opts?.resolveRelations) await this.resolveRelationLabels(collection, [dto])
    return dto
  }

  /**
   * Fetch dynamic-collection records by id, keyed by id. Batched (`whereIn`) so
   * relation-label resolution stays one query per target collection. Relations
   * can only target dynamic collections, so the dynamic table path suffices.
   */
  private async findRecordsByIds(
    targetKey: string,
    ids: string[]
  ): Promise<Map<string, CmsRecordDto>> {
    const out = new Map<string, CmsRecordDto>()
    if (!ids.length) return out
    const { table, collection } = await this.resolveRecordContext(targetKey)
    const rows = await db
      .from(table)
      .whereIn('id', [...new Set(ids)])
      .whereNull('deleted_at')
      .select('*')
    for (const row of rows as any[]) {
      const dto = this.rowToRecordDto(row, collection)
      out.set(dto.id, dto)
    }
    return out
  }

  /**
   * Swap each RELATION field's raw target id(s) for the target record's display
   * label — single → the label string, multi → labels joined by ", ", empty or
   * dangling → "". Public render paths only (opt-in via `resolveRelations`); the
   * admin/v1 paths keep ids. Target draft state is ignored: any non-deleted
   * target row yields a label. Batched per target collection to avoid N+1.
   */
  private async resolveRelationLabels(
    collection: CmsCollection,
    dtos: CmsRecordDto[]
  ): Promise<void> {
    if (!dtos.length) return
    const relFields = collection.fields.filter((f) => f.type === 'RELATION')
    if (!relFields.length) return

    // Pass 1 — collect target ids per target collection (fields sharing a
    // target coalesce into one query).
    const idsByTarget = new Map<string, Set<string>>()
    for (const field of relFields) {
      const targetKey = (field.config as { targetKey?: string })?.targetKey
      if (!targetKey) continue
      const bucket = idsByTarget.get(targetKey) ?? new Set<string>()
      for (const dto of dtos) {
        const v = dto.data[field.key]
        if (typeof v === 'string' && v) bucket.add(v)
        else if (Array.isArray(v))
          for (const id of v) if (typeof id === 'string' && id) bucket.add(id)
      }
      if (bucket.size) idsByTarget.set(targetKey, bucket)
    }

    // One batched fetch per target collection; a deleted target collection
    // (firstOrFail throws) degrades to blank labels rather than an error.
    const labelsByTarget = new Map<string, Map<string, CmsRecordDto>>()
    for (const [targetKey, ids] of idsByTarget) {
      try {
        labelsByTarget.set(targetKey, await this.findRecordsByIds(targetKey, [...ids]))
      } catch {
        labelsByTarget.set(targetKey, new Map())
      }
    }

    // Pass 2 — rewrite each record's relation value to label text.
    for (const field of relFields) {
      const targetKey = (field.config as { targetKey?: string })?.targetKey
      const byId = (targetKey && labelsByTarget.get(targetKey)) || new Map<string, CmsRecordDto>()
      for (const dto of dtos) {
        const v = dto.data[field.key]
        if (Array.isArray(v)) {
          dto.data[field.key] = v
            .map((id) => (typeof id === 'string' ? byId.get(id) : undefined))
            .filter((r): r is CmsRecordDto => !!r)
            .map((r) => recordLabel(r))
            .join(', ')
        } else if (typeof v === 'string' && v) {
          const target = byId.get(v)
          dto.data[field.key] = target ? recordLabel(target) : ''
        } else {
          dto.data[field.key] = ''
        }
      }
    }
  }

  /**
   * The id of a collection's single existing record (most-recent first), or
   * null if it has none yet. Used to route single types straight to their entry.
   */
  async findSoleRecordId(collectionKey: string): Promise<string | null> {
    const { table } = await this.resolveRecordContext(collectionKey)
    const row = await db
      .from(table)
      .whereNull('deleted_at')
      .orderBy(this.orderColumnForTable(table), 'desc')
      .select('id')
      .first()
    return row?.id != null ? String(row.id) : null
  }

  /**
   * A record write can change what any SSG page's CollectionList shows, but the
   * page snapshot is cached HTML that bakes in page-1 records. Nothing else
   * invalidates it on a record change, so a static page would serve stale
   * records indefinitely. Coarse-but-correct: drop every page snapshot (they
   * rebuild lazily on next visit), matching how template/settings changes work.
   */
  private async invalidatePageSnapshots(): Promise<void> {
    await new PagesService().invalidateAllSnapshots()
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

    if (collection.kind === 'single') {
      const counted = await db.from(table).whereNull('deleted_at').count('* as total')
      const total = Number((counted[0] as any)?.total ?? 0)
      if (total > 0) throw new Error('This is a single type — it can only have one entry')
    }

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
      if (field.type === 'PASSWORD') {
        payload[col] =
          val === undefined || val === null || val === '' ? null : await hash.make(String(val))
        continue
      }
      // many-to-many / one-to-many live outside the row — synced after insert.
      if (this.isMultiRelation(field)) continue
      payload[col] = this.serializeFieldValue(field.type, val)
    }

    try {
      await db.table(table).insert(payload)
    } catch (e) {
      throw this.rethrowDbError(e)
    }

    const insertedId = id ?? (await db.from(table).orderBy('id', 'desc').select('id').first())?.id
    if (!insertedId) throw new Error('Failed to create record')

    await this.syncMultiRelations(collection, String(insertedId), data)

    if (collection.revisionsOn) {
      await CmsRevision.create({
        id: newUlid(),
        collectionKey,
        recordId: String(insertedId),
        data: this.redactWriteOnly(collection, data),
        status: status as 'DRAFT' | 'PUBLISHED',
        authorId,
      })
    }

    const row = await db.from(table).where('id', insertedId).first()
    const result = this.rowToRecordDto(row, collection)
    await this.resolveMultiRelations(collection, [result])
    await this.invalidatePageSnapshots()
    return result
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

    let preparedData: Record<string, unknown> | null = null
    if (dto.data) {
      const data = this.prepareRecordData(collection, dto.data, { partial: true })
      preparedData = data
      if (collectionKey === 'content' && data.slug !== undefined) {
        await this.assertContentSlugAvailable(String(data.slug), id)
      }
      for (const field of collection.fields) {
        if (!(field.key in data)) continue
        const col = this.fieldToColumn(collection, field.key)
        if (col === 'status') continue
        this.ensureSlugValue(field, data)
        if (field.type === 'PASSWORD') {
          const pv = data[field.key]
          // Leave-blank-to-keep: an empty submission never overwrites the hash.
          if (pv === undefined || pv === null || pv === '') continue
          payload[col] = await hash.make(String(pv))
          continue
        }
        // many-to-many / one-to-many live outside the row — synced below.
        if (this.isMultiRelation(field)) continue
        payload[col] = this.serializeFieldValue(field.type, data[field.key])
      }
    }

    try {
      await db.from(table).where('id', id).update(payload)
    } catch (e) {
      throw this.rethrowDbError(e)
    }

    if (preparedData) {
      await this.syncMultiRelations(collection, id, preparedData)
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
        data: this.redactWriteOnly(collection, fieldData),
        status: (updated?.status ?? 'DRAFT') as 'DRAFT' | 'PUBLISHED',
        authorId,
      })
    }

    const row = await db.from(table).where('id', id).first()
    const result = this.rowToRecordDto(row, collection)
    await this.resolveMultiRelations(collection, [result])
    await this.invalidatePageSnapshots()
    return result
  }

  async deleteRecord(collectionKey: string, id: string): Promise<void> {
    const { table, collection } = await this.resolveRecordContext(collectionKey)
    if (collection.source === 'PRISMA' && collectionKey === 'user') {
      throw new Error('User records must be deleted via Admin → Users')
    }
    await db.from(table).where('id', id).update({ deleted_at: new Date().toISOString() })
    await this.invalidatePageSnapshots()
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
    await this.invalidatePageSnapshots()
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

      // Coerce + validate typed scalars whenever a value is supplied
      // (applies to both create and partial update).
      if (field.key in out) {
        out[field.key] = this.coerceFieldValue(field, out[field.key])
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

  /**
   * Coerce + validate a supplied scalar value by field type. Throws a
   * user-facing error for malformed input. Empty/nullish values pass through —
   * required-ness is enforced separately in {@link prepareRecordData}.
   */
  private coerceFieldValue(field: CmsField, val: unknown): unknown {
    if (val === undefined || val === null || val === '') return val
    switch (field.type) {
      case 'EMAIL': {
        const s = String(val).trim()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
          throw new Error(`${field.label} must be a valid email address`)
        }
        return s
      }
      case 'INTEGER': {
        const n = Number(val)
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          throw new Error(`${field.label} must be a whole number`)
        }
        return n
      }
      case 'DECIMAL': {
        const n = Number(val)
        if (!Number.isFinite(n)) {
          throw new Error(`${field.label} must be a number`)
        }
        return n
      }
      case 'RICHTEXT':
        return sanitizeRichText(val)
      default:
        return val
    }
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
    if (type === 'JSON' || type === 'RICHTEXT' || type === 'REPEATABLE' || type === 'COMPONENT') {
      return typeof val === 'string' ? val : JSON.stringify(val)
    }
    if (type === 'BOOL') {
      if (isPostgres()) return Boolean(val)
      return val ? 1 : 0
    }
    return val
  }

  /** Null out write-only fields (PASSWORD) so secrets never leave the server. */
  private redactWriteOnly(
    collection: CmsCollection,
    data: Record<string, unknown>
  ): Record<string, unknown> {
    const out = { ...data }
    for (const field of collection.fields) {
      if (field.type === 'PASSWORD') out[field.key] = null
    }
    return out
  }

  private rowToRecordDto(row: any, collection?: CmsCollection): CmsRecordDto {
    const { id, status, author_id, created_at, updated_at, deleted_at, ...rest } = row
    const data: Record<string, unknown> = {}

    if (collection?.fields?.length) {
      for (const field of collection.fields) {
        // Write-only fields never leave the server (e.g. password hashes).
        if (field.type === 'PASSWORD') {
          data[field.key] = null
          continue
        }
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
      kind: col.kind ?? 'collection',
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
