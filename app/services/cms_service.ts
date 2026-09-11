import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import hash from '@adonisjs/core/services/hash'
import CmsCollection from '#models/cms_collection'
import CmsField from '#models/cms_field'
import CmsComponent, { type CmsComponentField } from '#models/cms_component'
import CmsRevision from '#models/cms_revision'
import { newUlid } from '#services/ulid_service'
import CmsPermissionsService from '#services/cms_permissions_service'
import PagesService from '#services/pages_service'
import ModulesService from '#services/modules_service'
import { isPostgres, recordLabel, coerceFieldValue, serializeFieldValue } from '#cms/field_values'
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
  | 'MULTISELECT'
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
    // MULTISELECT stores an array of chosen options as JSON (like REPEATABLE).
    MULTISELECT: { sqlType: pg ? 'JSONB' : 'TEXT', allowsUnique: false, allowsIndex: false },
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
  if (!KEY_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${kind} key "${value}" — keys must be lowercase snake_case: start with a letter, ` +
        `then only letters, digits or underscores, max 32 chars (e.g. "compare_at_price"). No ` +
        `camelCase, hyphens or spaces.`
    )
  }
  if (RESERVED.has(value)) {
    throw new Error(`"${value}" is a reserved identifier — pick another ${kind} key`)
  }
}

/**
 * Scalar-only field types allowed inside a COMPONENT — mirrors the client
 * `COMPONENT_SUBFIELD_TYPE_OPTIONS`. No relation/password (no FK or hashing in
 * JSONB) and no nesting (component/repeatable/json/slug/select), so a direct
 * API call can't smuggle in a type the structured editor never offers.
 */
const COMPONENT_SUBFIELD_TYPES = new Set<CmsFieldType>([
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'RICHTEXT',
  'NUMBER',
  'INTEGER',
  'DECIMAL',
  'BOOL',
  'DATE',
  'DATETIME',
  'MEDIA',
])

function dynamicTableName(key: string): string {
  return `cms_${key}`
}

/** Join table backing a many-to-many relation field. */
function relationJoinTableName(srcKey: string, fieldKey: string): string {
  return `cms_${srcKey}_${fieldKey}`
}

/**
 * A dynamic collection's flavour:
 * - COLLECTION — a stand-alone `cms_<key>` table with its own records.
 * - CONTENT / PRODUCT — metadata-only: no table of its own; its fields extend a
 *   built-in editor (Content / ecommerce Product) and their values live in that
 *   host row's `data` JSON. Each is a singleton.
 */
export type CmsCollectionType = 'COLLECTION' | 'CONTENT' | 'PRODUCT'

/** The metadata-only subset of {@link CmsCollectionType}. */
export type CmsMetadataType = 'CONTENT' | 'PRODUCT'

/**
 * Collection keys that are off-limits to dynamic collections: `posts` is the
 * built-in adapter (also blocked by isBuiltinCollectionKey), and `content` /
 * `post` are reserved so a dynamic table never shadows the built-in Content.
 */
const RESERVED_COLLECTION_KEYS = new Set(['content', 'post', 'posts'])

/**
 * Field keys a Content-type collection may not define — the built-in Content
 * editor owns these natively (its own columns).
 */
const CONTENT_RESERVED_FIELD_KEYS = new Set([
  'title',
  'slug',
  'body',
  'status',
  'visibility',
  'password',
])

/**
 * Field keys a Product-type collection may not define — the built-in ecommerce
 * Product editor owns these natively (its own columns / relations).
 */
const PRODUCT_RESERVED_FIELD_KEYS = new Set([
  'title',
  'slug',
  'subtitle',
  'description',
  'type',
  'status',
  'currency',
  'price',
  'seo',
  'options',
  'featured',
  'cta_mode',
  'external_url',
  'external_label',
  'position',
  'variants',
  'images',
  'categories',
  'tags',
  'data',
])

/**
 * The metadata-only collection types, in one place. Each owns no physical table
 * — its fields extend a built-in editor and their values live in that host
 * table's `data` JSON — is a singleton, and may require a module to be enabled.
 */
const METADATA_TYPE_CONFIG: Record<
  CmsMetadataType,
  {
    /** Human label for error messages. */
    label: string
    /** Field keys the built-in editor owns natively — off-limits to custom fields. */
    reservedFieldKeys: Set<string>
    /** Module that must be enabled for this type (null = always available). */
    requiresModule: string | null
    /** Built-in host table whose `data` column holds this type's field values. */
    dataTable: string
  }
> = {
  CONTENT: {
    label: 'Content',
    reservedFieldKeys: CONTENT_RESERVED_FIELD_KEYS,
    requiresModule: null,
    dataTable: 'contents',
  },
  PRODUCT: {
    label: 'Product',
    reservedFieldKeys: PRODUCT_RESERVED_FIELD_KEYS,
    requiresModule: 'ecommerce',
    dataTable: 'ecommerce_products',
  },
}

/**
 * True for the metadata-only types (no table, singleton, fields extend an editor).
 * Exported so callers that enumerate record-bearing collections (e.g. the
 * data-transfer sections) share one definition instead of re-checking `type`.
 */
export function isMetadataOnly(type: CmsCollectionType): type is CmsMetadataType {
  return type === 'CONTENT' || type === 'PRODUCT'
}

export interface CmsCollectionDto {
  id: string
  key: string
  label: string
  icon: string | null
  group: string | null
  source: string
  type: CmsCollectionType
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
    // Look across trashed rows too: the `key` column has a DB-level unique
    // constraint that a soft-deleted row still occupies, so a plain insert with
    // a previously-used key would hit a constraint error ("burned" key). Revive
    // and overwrite the trashed row instead.
    const existing = await CmsComponent.query().where('key', dto.key).first()
    if (existing && !existing.deletedAt) {
      throw new Error(`Component "${dto.key}" already exists`)
    }
    const fields = this.normalizeComponentFields(dto.fields)
    if (existing) {
      existing.label = dto.label
      existing.icon = dto.icon ?? null
      existing.fields = fields
      existing.deletedAt = null
      await existing.save()
      return this.componentToDto(existing)
    }
    const c = await CmsComponent.create({
      id: newUlid(),
      key: dto.key,
      label: dto.label,
      icon: dto.icon ?? null,
      fields,
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
    c.deletedAt = DateTime.now()
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
      if (!COMPONENT_SUBFIELD_TYPES.has(type as CmsFieldType)) {
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
    // Metadata-only collections (Content / Product) define fields for a built-in
    // editor, not their own records — nothing to bind a CollectionList to, so
    // they never appear here.
    const allDynamic = await this.listCollections()
    const dynamic = allDynamic.filter((c) => !isMetadataOnly(c.type))
    const epoch = new Date(0).toISOString()
    const mapped: CmsCollectionDto[] = builtins.map((b) => ({
      id: `builtin:${b.key}`,
      key: b.key,
      label: b.label,
      icon: b.icon ?? null,
      group: b.group ?? 'Built-in',
      source: 'BUILTIN',
      type: 'COLLECTION',
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

  /** The singleton metadata-only collection of a given type, or null. */
  private async metadataCollectionOfType(type: CmsMetadataType): Promise<CmsCollectionDto | null> {
    const row = await CmsCollection.query()
      .where('type', type)
      .whereNull('deleted_at')
      .preload('fields', (q) => q.whereNull('deleted_at').orderBy('order'))
      .first()
    return row ? this.collectionToDto(row) : null
  }

  /**
   * The singleton Content-type collection (its fields extend the built-in
   * Content editor), or null when none has been created. Used by
   * `ContentService` to coerce + resolve a post's custom `data`.
   */
  async contentTypeCollection(): Promise<CmsCollectionDto | null> {
    return this.metadataCollectionOfType('CONTENT')
  }

  /**
   * The singleton Product-type collection (its fields extend the built-in
   * ecommerce Product editor), or null when none has been created. Used by the
   * ecommerce catalog to coerce + resolve a product's custom `data`.
   */
  async productTypeCollection(): Promise<CmsCollectionDto | null> {
    return this.metadataCollectionOfType('PRODUCT')
  }

  /**
   * Guard that a metadata-only type's owning module is enabled. Creating or
   * switching to such a type while its module is off is refused with a clear
   * message; COLLECTION and module-less types always pass.
   */
  private async assertMetadataTypeAvailable(type: CmsCollectionType): Promise<void> {
    if (!isMetadataOnly(type)) return
    const cfg = METADATA_TYPE_CONFIG[type]
    if (!cfg.requiresModule) return
    const enabled = await new ModulesService().isEnabled(cfg.requiresModule)
    if (!enabled) {
      throw new Error(
        `${cfg.label}-type collections require the ${cfg.requiresModule} module to be enabled`
      )
    }
  }

  /**
   * Enforce the one-per-type rule for a metadata-only type. `exceptId` skips the
   * collection being switched so it never conflicts with itself.
   */
  private async assertMetadataSingleton(type: CmsMetadataType, exceptId?: string): Promise<void> {
    const q = CmsCollection.query().where('type', type).whereNull('deleted_at')
    if (exceptId) q.whereNot('id', exceptId)
    const existing = await q.first()
    if (existing) {
      throw new Error(
        `A ${METADATA_TYPE_CONFIG[type].label}-type collection ("${existing.key}") already exists — there can be only one`
      )
    }
  }

  /** Fetch dynamic records by id for a given collection key (public helper for label/media resolution). */
  async recordsByIds(targetKey: string, ids: string[]): Promise<Map<string, CmsRecordDto>> {
    return this.findRecordsByIds(targetKey, ids)
  }

  async createCollection(dto: {
    key: string
    label: string
    icon?: string
    group?: string
    type?: CmsCollectionType
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
    const type: CmsCollectionType =
      dto.type === 'CONTENT' || dto.type === 'PRODUCT' ? dto.type : 'COLLECTION'
    // `posts` / `products` are answered by their adapters; a dynamic collection
    // under the same key could never be reached from the builder.
    if (isBuiltinCollectionKey(dto.key)) {
      throw new Error(`"${dto.key}" is a built-in collection — pick another key`)
    }
    // `content` / `post` are reserved so a dynamic table never shadows the built-in Content.
    if (RESERVED_COLLECTION_KEYS.has(dto.key)) {
      throw new Error(`"${dto.key}" is a reserved collection key — pick another key`)
    }

    // A metadata-only type (Content / Product) extends a built-in editor: its
    // module must be enabled, only one may exist, and it owns no records of its
    // own (metadata only).
    if (isMetadataOnly(type)) {
      await this.assertMetadataTypeAvailable(type)
      await this.assertMetadataSingleton(type)
    }

    const existing = await CmsCollection.query()
      .where('key', dto.key)
      .whereNull('deleted_at')
      .first()
    if (existing) throw new Error(`Collection "${dto.key}" already exists`)

    // The key column is globally unique in the DB, and delete is a soft delete —
    // so a trashed collection still owns the key. Surface that clearly instead of
    // letting a raw "duplicate key" constraint error reach the caller.
    const trashed = await CmsCollection.query()
      .where('key', dto.key)
      .whereNotNull('deleted_at')
      .first()
    if (trashed) {
      throw new Error(
        `A collection "${dto.key}" is in the Trash — restore it or permanently delete it before reusing the key`
      )
    }

    // Validate EVERY field UP FRONT, before any write. Previously an invalid key
    // (e.g. camelCase "compareAtPrice") threw mid-loop, after the collection and
    // some fields were already committed but before the physical table was
    // created — leaving a "zombie" collection whose cms_<key> table never existed.
    const inputFields = dto.fields ?? []
    const seenFieldKeys = new Set<string>()
    // Relation targets are validated here, BEFORE the transaction opens: the
    // lookup runs on the default connection, and querying it while a write
    // transaction is open deadlocks SQLite. Cached for the in-trx seeding below.
    const relationTargetByKey = new Map<string, CmsCollection>()
    for (const f of inputFields) {
      assertValidKey(f.key, 'field')
      if (isMetadataOnly(type)) {
        const cfg = METADATA_TYPE_CONFIG[type]
        if (cfg.reservedFieldKeys.has(f.key)) {
          throw new Error(`"${f.key}" is a built-in ${cfg.label} field — pick another field key`)
        }
      }
      if (seenFieldKeys.has(f.key)) throw new Error(`Duplicate field key "${f.key}"`)
      seenFieldKeys.add(f.key)
      if (!FIELD_REGISTRY[f.type]) throw new Error(`Unknown field type "${f.type}"`)
      if (f.type === 'RELATION') {
        const rel = this.parseRelationConfig(f.config)
        relationTargetByKey.set(f.key, await this.validateRelationTarget(rel.targetKey))
      }
    }

    // Metadata rows + the CREATE TABLE commit together (Postgres and SQLite both
    // run DDL transactionally), so a failure anywhere rolls the whole thing back
    // — never a collection without its table.
    const trx = await db.transaction()
    try {
      const collection = await CmsCollection.create(
        {
          id: newUlid(),
          key: dto.key,
          label: dto.label,
          icon: dto.icon ?? null,
          group: dto.group ?? null,
          source: 'DYNAMIC',
          type,
          // A metadata-only collection has no physical table of its own — its
          // fields are stored in the host editor's `data` (contents / products).
          tableName: isMetadataOnly(type) ? null : dynamicTableName(dto.key),
          listConfig: {},
          revisionsOn: dto.revisionsOn ?? true,
          draftsOn: dto.draftsOn ?? true,
          kind: dto.kind === 'single' ? 'single' : 'collection',
        },
        { client: trx }
      )

      // Scalar fields become physical columns; relation fields own their own
      // storage (join table / FK) and must be created AFTER the main table
      // exists, so they are deferred. On a metadata-only collection every field —
      // relations included — is metadata only (stored in the host `data`).
      const scalarFields: CmsField[] = []
      const relationInputs: Array<{ input: (typeof inputFields)[number]; order: number }> = []

      for (let i = 0; i < inputFields.length; i++) {
        const f = inputFields[i]!
        if (f.type === 'RELATION' && !isMetadataOnly(type)) {
          relationInputs.push({ input: f, order: i })
          continue
        }

        let config = f.config ?? {}
        let unique = f.unique ?? false
        // A metadata-only relation is metadata only — normalize its config
        // (target already validated above, before the transaction).
        if (f.type === 'RELATION') {
          const rel = this.parseRelationConfig(f.config)
          config = { targetKey: rel.targetKey, relationType: rel.relationType }
          unique = false
        }

        const field = await CmsField.create(
          {
            id: newUlid(),
            collectionId: collection.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required ?? false,
            unique,
            order: i,
            config,
          },
          { client: trx }
        )
        scalarFields.push(field)
      }

      // Metadata-only collections have no table and no records permissions.
      if (!isMetadataOnly(type)) {
        await this.createDynamicTable(dto.key, scalarFields, trx)
        // Now the source table exists — seed each relation's storage + metadata.
        // Targets were validated before the transaction (SQLite lock safety).
        for (const { input: f, order } of relationInputs) {
          const rel = this.parseRelationConfig(f.config)
          const target = relationTargetByKey.get(f.key)!
          const { config, ddl } = this.buildRelationDdl(collection, target, f.key, rel)
          await CmsField.create(
            {
              id: newUlid(),
              collectionId: collection.id,
              key: f.key,
              label: f.label,
              type: 'RELATION',
              required: false,
              unique: rel.relationType === 'oneToOne',
              order,
              config,
            },
            { client: trx }
          )
          await trx.rawQuery(ddl)
        }
      }
      await trx.commit()
    } catch (e) {
      await trx.rollback()
      throw e
    }

    if (!isMetadataOnly(type)) {
      await this.permissions.mintForCollection(dto.key)
    }
    return this.findCollection(dto.key)
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
      /** Rename the collection's key (renames its physical storage live). */
      key?: string
      /** Switch between COLLECTION and a metadata-only type (allowed only while empty). */
      type?: CmsCollectionType
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

    // Type switch first (it changes whether a physical table exists), then the
    // rename (which renames whatever storage the final type has).
    if (dto.type !== undefined && dto.type !== (collection.type ?? 'COLLECTION')) {
      await this.switchCollectionType(collection, dto.type)
    }
    if (dto.key !== undefined && dto.key !== collection.key) {
      await this.renameCollection(collection, dto.key)
    }

    return this.findCollection(collection.key)
  }

  /**
   * Switch a collection's type — allowed only while "empty", so no data is ever
   * dropped. Modelled as a **leave** step (guard the source is empty) then an
   * **enter** step (build/strip storage for the destination):
   * - Leaving COLLECTION: the `cms_<key>` table must have no rows.
   * - Leaving a metadata-only type (CONTENT/PRODUCT): no host row (contents /
   *   ecommerce_products) may carry saved custom-field `data`.
   * - Entering a metadata-only type: its module must be enabled and its singleton
   *   free; the records table (and relation storage) is dropped and relation
   *   fields become metadata-only.
   * - Entering COLLECTION: a fresh records table (plus relation storage) is built
   *   from the fields.
   * COLLECTION ↔ metadata and metadata ↔ metadata are all covered by composing
   * these two steps.
   */
  private async switchCollectionType(
    collection: CmsCollection,
    newType: CmsCollectionType
  ): Promise<void> {
    const oldType: CmsCollectionType = collection.type ?? 'COLLECTION'
    if (oldType === newType) return

    // Entering a metadata-only type: gate on its module + singleton up front.
    if (isMetadataOnly(newType)) {
      await this.assertMetadataTypeAvailable(newType)
      await this.assertMetadataSingleton(newType, collection.id)
    }

    // Leave guard: the source must be empty so the switch drops no data.
    if (oldType === 'COLLECTION') {
      const table = dynamicTableName(collection.key)
      if (await db.connection().schema.hasTable(table)) {
        const counted = await db.from(table).count('* as total')
        if (Number((counted[0] as any)?.total ?? 0) > 0) {
          throw new Error('Switching type is only allowed while the collection has no records')
        }
      }
    } else {
      await this.assertNoSavedMetadataData(oldType)
    }

    if (isMetadataOnly(newType)) {
      await this.demoteToMetadataOnly(collection, newType)
      await this.permissions.removeForCollection(collection.key)
      return
    }

    await this.promoteToCollection(collection)
    await this.permissions.mintForCollection(collection.key)
  }

  /**
   * Refuse to leave a metadata-only type once its host editor has saved any
   * custom-field data. The host table is read from {@link METADATA_TYPE_CONFIG}
   * (`contents` / `ecommerce_products`); a missing table (e.g. the ecommerce
   * module was never installed) means no data, so the switch is allowed.
   */
  private async assertNoSavedMetadataData(type: CmsMetadataType): Promise<void> {
    const { dataTable, label } = METADATA_TYPE_CONFIG[type]
    if (!(await db.connection().schema.hasTable(dataTable))) return
    const usedRow = await db
      .from(dataTable)
      .whereNotNull('data')
      .whereNotIn('data', ['{}', 'null', ''])
      .first()
    if (usedRow) {
      throw new Error(
        `Switching away from ${label} is only allowed before any ${label.toLowerCase()} has saved custom-field data`
      )
    }
  }

  /**
   * Turn a collection into a metadata-only type: drop the records table and any
   * relation storage, strip relations to their shape (target + cardinality), and
   * re-tag the row. Safe to run on a collection that already has no table (a
   * metadata → metadata switch).
   */
  private async demoteToMetadataOnly(
    collection: CmsCollection,
    newType: CmsMetadataType
  ): Promise<void> {
    const table = dynamicTableName(collection.key)
    const trx = await db.transaction()
    try {
      for (const field of collection.fields) {
        if (field.type === 'RELATION') {
          const cfg = field.config as {
            relationType?: string
            joinTable?: string
            inverseColumn?: string
            targetKey?: string
          }
          if (cfg.relationType === 'manyToMany') {
            const joinTable = cfg.joinTable ?? relationJoinTableName(collection.key, field.key)
            await trx.rawQuery(`DROP TABLE IF EXISTS "${joinTable}"`)
          } else if (cfg.relationType === 'oneToMany' && cfg.targetKey) {
            const targetTable = dynamicTableName(cfg.targetKey)
            const col = cfg.inverseColumn ?? `${collection.key}_${field.key}`
            if (await db.connection().schema.hasColumn(targetTable, col)) {
              await trx.rawQuery(`ALTER TABLE "${targetTable}" DROP COLUMN "${col}"`)
            }
          }
          // Strip storage-specific config — metadata relations keep only the shape.
          field.useTransaction(trx)
          field.config = { targetKey: cfg.targetKey, relationType: cfg.relationType }
          await field.save()
        }
      }
      await trx.rawQuery(`DROP TABLE IF EXISTS "${table}"`)
      collection.type = newType
      collection.tableName = null
      collection.useTransaction(trx)
      await collection.save()
      await trx.commit()
    } catch (e) {
      await trx.rollback()
      throw e
    }
  }

  /**
   * Turn a metadata-only collection into a records COLLECTION: build a fresh
   * `cms_<key>` table plus relation storage from its fields, and re-tag the row.
   */
  private async promoteToCollection(collection: CmsCollection): Promise<void> {
    // Validate every relation target BEFORE the transaction (SQLite lock safety).
    const relationTargets = new Map<string, CmsCollection>()
    for (const field of collection.fields) {
      if (field.type !== 'RELATION') continue
      const rel = this.parseRelationConfig(field.config)
      relationTargets.set(field.key, await this.validateRelationTarget(rel.targetKey))
    }

    const trx = await db.transaction()
    try {
      const scalarFields = collection.fields.filter((f) => f.type !== 'RELATION')
      await this.createDynamicTable(collection.key, scalarFields, trx)
      for (const field of collection.fields) {
        if (field.type !== 'RELATION') continue
        const rel = this.parseRelationConfig(field.config)
        const target = relationTargets.get(field.key)!
        const { config, ddl } = this.buildRelationDdl(collection, target, field.key, rel)
        field.useTransaction(trx)
        field.config = config
        await field.save()
        await trx.rawQuery(ddl)
      }
      collection.type = 'COLLECTION'
      collection.tableName = dynamicTableName(collection.key)
      collection.useTransaction(trx)
      await collection.save()
      await trx.commit()
    } catch (e) {
      await trx.rollback()
      throw e
    }
  }

  /**
   * Rename a collection's key live: the metadata row, its physical table and any
   * relation storage it owns, its revisions, and its permissions all move to the
   * new key in one transaction. Page-builder bindings that reference the old key
   * must be re-pointed by the operator.
   */
  private async renameCollection(collection: CmsCollection, newKey: string): Promise<void> {
    assertValidKey(newKey, 'collection')
    if (isBuiltinCollectionKey(newKey)) {
      throw new Error(`"${newKey}" is a built-in collection — pick another key`)
    }
    if (RESERVED_COLLECTION_KEYS.has(newKey)) {
      throw new Error(`"${newKey}" is a reserved collection key — pick another key`)
    }
    const clash = await CmsCollection.query()
      .where('key', newKey)
      .whereNot('id', collection.id)
      .first()
    if (clash) {
      throw new Error(`A collection with key "${newKey}" already exists (it may be in the Trash)`)
    }

    const oldKey = collection.key
    // Only a records COLLECTION owns physical storage to rename; metadata-only
    // types (Content / Product) have none.
    const isCollectionType = !isMetadataOnly(collection.type ?? 'COLLECTION')

    const trx = await db.transaction()
    try {
      if (isCollectionType) {
        const oldTable = dynamicTableName(oldKey)
        const newTable = dynamicTableName(newKey)
        await trx.rawQuery(`ALTER TABLE "${oldTable}" RENAME TO "${newTable}"`)

        for (const field of collection.fields) {
          if (field.type !== 'RELATION') continue
          const cfg = field.config as {
            relationType?: string
            joinTable?: string
            inverseColumn?: string
            targetKey?: string
          }
          if (cfg.relationType === 'manyToMany') {
            const oldJoin = cfg.joinTable ?? relationJoinTableName(oldKey, field.key)
            const newJoin = relationJoinTableName(newKey, field.key)
            await trx.rawQuery(`ALTER TABLE "${oldJoin}" RENAME TO "${newJoin}"`)
            field.useTransaction(trx)
            field.config = { ...cfg, joinTable: newJoin }
            await field.save()
          } else if (cfg.relationType === 'oneToMany' && cfg.targetKey) {
            const targetTable = dynamicTableName(cfg.targetKey)
            const oldCol = cfg.inverseColumn ?? `${oldKey}_${field.key}`
            const newCol = `${newKey}_${field.key}`
            await trx.rawQuery(
              `ALTER TABLE "${targetTable}" RENAME COLUMN "${oldCol}" TO "${newCol}"`
            )
            field.useTransaction(trx)
            field.config = { ...cfg, inverseColumn: newCol }
            await field.save()
          }
        }
        collection.tableName = newTable
      }

      await trx
        .from('cms_revisions')
        .where('collection_key', oldKey)
        .update({ collection_key: newKey })
      collection.key = newKey
      collection.useTransaction(trx)
      await collection.save()
      await trx.commit()
    } catch (e) {
      await trx.rollback()
      throw e
    }

    if (isCollectionType) {
      await this.permissions.removeForCollection(oldKey)
      await this.permissions.mintForCollection(newKey)
    }
  }

  async deleteCollection(key: string): Promise<void> {
    const collection = await CmsCollection.query()
      .where('key', key)
      .whereNull('deleted_at')
      .firstOrFail()

    if (collection.source !== 'DYNAMIC') throw new Error('Native collections cannot be deleted')

    // Soft delete only — the dynamic table and permissions are kept so the
    // collection can be restored from the Trash. They are dropped on force-delete.
    collection.deletedAt = DateTime.now()
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

    // Restoring must not resurrect a second metadata-only collection of the same
    // type, nor re-enable one whose module has since been turned off.
    if (isMetadataOnly(collection.type)) {
      await this.assertMetadataTypeAvailable(collection.type)
      await this.assertMetadataSingleton(collection.type, collection.id)
    }

    collection.deletedAt = null
    await collection.save()
    // Metadata-only collections mint no records permissions (they have no records).
    if (!isMetadataOnly(collection.type)) {
      await this.permissions.mintForCollection(key)
    }
    return this.collectionToDto(collection)
  }

  /** Permanently delete a trashed collection: drop its dynamic table + permissions. */
  async forceDeleteCollection(key: string): Promise<void> {
    const collection = await CmsCollection.query()
      .where('key', key)
      .whereNotNull('deleted_at')
      .preload('fields', (q) => q.orderBy('order'))
      .firstOrFail()

    const mainTable = dynamicTableName(key)
    const trx = await db.transaction()
    try {
      // Drop this collection's own relation storage FIRST, so the main table has
      // no dangling dependents, then the table + revisions + metadata row — all
      // in one transaction. The DROP error is NOT swallowed: if it still fails
      // (e.g. another collection references this table), everything rolls back
      // rather than orphaning the physical table.
      for (const field of collection.fields) {
        if (field.type !== 'RELATION') continue
        const cfg = field.config as {
          relationType?: string
          joinTable?: string
          inverseColumn?: string
          targetKey?: string
        }
        if (cfg.relationType === 'manyToMany') {
          const joinTable = cfg.joinTable ?? relationJoinTableName(key, field.key)
          await trx.rawQuery(`DROP TABLE IF EXISTS "${joinTable}"`)
        } else if (cfg.relationType === 'oneToMany' && cfg.targetKey) {
          const targetTable = dynamicTableName(cfg.targetKey)
          const col = cfg.inverseColumn ?? `${key}_${field.key}`
          if (await db.connection().schema.hasColumn(targetTable, col)) {
            await trx.rawQuery(`ALTER TABLE "${targetTable}" DROP COLUMN "${col}"`)
          }
        }
      }

      await trx.rawQuery(`DROP TABLE IF EXISTS "${mainTable}"`)
      await trx.from('cms_revisions').where('collection_key', key).delete()
      await collection.useTransaction(trx).delete()
      await trx.commit()
    } catch (e) {
      await trx.rollback()
      throw e
    }

    await this.permissions.removeForCollection(key)
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

    if (isMetadataOnly(collection.type)) {
      const cfg = METADATA_TYPE_CONFIG[collection.type]
      if (cfg.reservedFieldKeys.has(dto.key)) {
        throw new Error(`"${dto.key}" is a built-in ${cfg.label} field — pick another field key`)
      }
    }

    const existing = collection.fields.find((f) => f.key === dto.key)
    if (existing) throw new Error(`Field "${dto.key}" already exists`)

    if (dto.required) throw new Error('Fields added to existing collections must be optional')

    const desc = FIELD_REGISTRY[dto.type]
    if (!desc) throw new Error(`Unknown field type "${dto.type}"`)

    const order = collection.fields.length

    // A metadata-only collection has no physical table — every field (relation
    // included) is metadata only, stored in the host `data`. No DDL at all.
    if (isMetadataOnly(collection.type)) {
      return this.addMetadataField(collection, dto, order)
    }

    if (dto.type === 'RELATION') {
      return this.addRelationField(collection, dto, order)
    }

    // Only enforce uniqueness for types that support it; store what we actually
    // apply so the metadata never claims a constraint the DB doesn't have.
    const applyUnique = !!dto.unique && desc.allowsUnique
    const table = dynamicTableName(collectionKey)

    // The field row + the ALTER TABLE (and unique index) commit together, so a
    // DDL failure can't leave a metadata field with no matching column.
    const trx = await db.transaction()
    try {
      const field = await CmsField.create(
        {
          id: newUlid(),
          collectionId: collection.id,
          key: dto.key,
          label: dto.label,
          type: dto.type,
          required: false,
          unique: applyUnique,
          order,
          config: dto.config ?? {},
        },
        { client: trx }
      )

      await trx.rawQuery(`ALTER TABLE "${table}" ADD COLUMN "${dto.key}" ${desc.sqlType} NULL`)

      if (applyUnique) {
        // A separate unique INDEX (not an inline column constraint) — SQLite can't
        // add a UNIQUE column via ALTER, and this works the same on Postgres. The
        // new column is all-NULL on existing rows, and NULLs stay distinct.
        const idx = `${table}_${dto.key}_uq`.slice(0, 63)
        await trx.rawQuery(`CREATE UNIQUE INDEX "${idx}" ON "${table}" ("${dto.key}")`)
      }

      await trx.commit()
      return this.fieldToDto(field)
    } catch (e) {
      await trx.rollback()
      throw e
    }
  }

  /**
   * Persist a field on a metadata-only collection (Content / Product): metadata
   * only, no DDL. A relation just records its target + cardinality in `config`
   * (its ids live in the host `data[key]`); the target must be a real records
   * collection, never another metadata-only collection.
   */
  private async addMetadataField(
    collection: CmsCollection,
    dto: {
      key: string
      label: string
      type: CmsFieldType
      config?: Record<string, unknown>
    },
    order: number
  ): Promise<CmsFieldDto> {
    let config: Record<string, unknown> = dto.config ?? {}

    if (dto.type === 'RELATION') {
      const rel = this.parseRelationConfig(dto.config)
      const target = await CmsCollection.query()
        .where('key', rel.targetKey)
        .whereNull('deleted_at')
        .first()
      if (!target || target.source !== 'DYNAMIC' || isMetadataOnly(target.type)) {
        throw new Error(`Relation target "${rel.targetKey}" must be an existing records collection`)
      }
      config = { targetKey: rel.targetKey, relationType: rel.relationType }
    }

    const field = await CmsField.create({
      id: newUlid(),
      collectionId: collection.id,
      key: dto.key,
      label: dto.label,
      type: dto.type,
      required: false,
      // No physical column, so there is no DB-level uniqueness to enforce.
      unique: false,
      order,
      config,
    })
    return this.fieldToDto(field)
  }

  private parseRelationConfig(config: Record<string, unknown> | undefined): {
    targetKey: string
    relationType: CmsRelationType
  } {
    const targetKey = typeof config?.targetKey === 'string' ? config.targetKey.trim() : ''
    if (!targetKey) {
      throw new Error(
        'A RELATION field needs config.targetKey — the key of an existing dynamic collection to ' +
          'link to (optionally config.relationType: manyToOne | oneToOne | manyToMany | oneToMany)'
      )
    }
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
  /**
   * Validate a relation target: it must be an existing, non-deleted dynamic
   * records collection (never a native or Content-type collection).
   */
  private async validateRelationTarget(targetKey: string): Promise<CmsCollection> {
    const target = await CmsCollection.query()
      .where('key', targetKey)
      .whereNull('deleted_at')
      .first()
    if (!target) {
      throw new Error(
        `Relation target "${targetKey}" does not exist — create that collection first ` +
          `(relations can only point at dynamic collections)`
      )
    }
    if (target.source !== 'DYNAMIC' || isMetadataOnly(target.type)) {
      throw new Error('Relations can only target dynamic records collections')
    }
    return target
  }

  /**
   * Build the `config` + `ddl` for a relation field on a records collection.
   * Pure (no DB) — the caller runs the DDL on whatever transaction it owns, so
   * this is shared by post-create `addRelationField` and create-time seeding.
   */
  private buildRelationDdl(
    collection: CmsCollection,
    target: CmsCollection,
    fieldKey: string,
    rel: { targetKey: string; relationType: CmsRelationType }
  ): { config: Record<string, unknown>; ddl: string } {
    const srcTable = dynamicTableName(collection.key)
    const targetTable = dynamicTableName(target.key)
    const config: Record<string, unknown> = {
      targetKey: rel.targetKey,
      relationType: rel.relationType,
    }
    let ddl: string

    if (rel.relationType === 'manyToMany') {
      const joinTable = relationJoinTableName(collection.key, fieldKey)
      config.joinTable = joinTable
      ddl =
        `CREATE TABLE IF NOT EXISTS "${joinTable}" (` +
        `"source_id" TEXT NOT NULL REFERENCES "${srcTable}" ("id") ON DELETE CASCADE, ` +
        `"target_id" TEXT NOT NULL REFERENCES "${targetTable}" ("id") ON DELETE CASCADE, ` +
        `PRIMARY KEY ("source_id", "target_id"))`
    } else if (rel.relationType === 'oneToMany') {
      // The "many" side (target) holds the FK back to this record.
      const inverseColumn = `${collection.key}_${fieldKey}`
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
        `ALTER TABLE "${srcTable}" ADD COLUMN "${fieldKey}" TEXT NULL${uniqueClause} ` +
        `REFERENCES "${targetTable}" ("id") ON DELETE SET NULL`
    }

    return { config, ddl }
  }

  private async addRelationField(
    collection: CmsCollection,
    dto: { key: string; label: string; config?: Record<string, unknown> },
    order: number
  ): Promise<CmsFieldDto> {
    const rel = this.parseRelationConfig(dto.config)
    const target = await this.validateRelationTarget(rel.targetKey)
    const { config, ddl } = this.buildRelationDdl(collection, target, dto.key, rel)

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
    data: Record<string, unknown>,
    trx?: TransactionClientContract
  ): Promise<void> {
    // Run every read/write on the caller's transaction when given, so the
    // destructive delete-then-reinsert can't half-apply and lose relations.
    const client = trx ?? db
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
        await client.from(joinTable).where('source_id', recordId).delete()
        if (targetIds.length) {
          await client
            .table(joinTable)
            .multiInsert(targetIds.map((t) => ({ source_id: recordId, target_id: t })))
        }
      } else {
        // oneToMany: repoint the target rows' inverse FK to this record.
        const targetTable = dynamicTableName(cfg.targetKey ?? '')
        const col = cfg.inverseColumn ?? `${collection.key}_${field.key}`
        await client
          .from(targetTable)
          .where(col, recordId)
          .update({ [col]: null })
        if (targetIds.length) {
          await client
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

    // Metadata-only fields own no physical schema — just soft-delete the metadata.
    if (isMetadataOnly(collection.type)) {
      field.deletedAt = DateTime.now()
      await field.save()
      return
    }

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
        field.deletedAt = DateTime.now()
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

    field.deletedAt = DateTime.now()
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
      /**
       * Taxonomy filters honoured only by the built-in `posts` adapter (category
       * or tag by slug) — used by the archive-override render path.
       */
      categorySlug?: string
      tagSlug?: string
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
    opts?: { resolveRelations?: boolean; resolveMedia?: boolean }
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
        categorySlug: query.categorySlug,
        tagSlug: query.tagSlug,
        sortField: query.sortField,
        sortDir: query.sortDir,
      })
    }

    const { table, collection } = await this.resolveRecordContext(collectionKey)
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20))
    const offset = (page - 1) * pageSize

    // Tolerate a collection whose physical table is missing (e.g. a legacy
    // half-created collection): return an empty page instead of a 500 loop, so
    // the admin can still open the collection and delete it.
    if (collection.source === 'DYNAMIC' && !(await db.connection().schema.hasTable(table))) {
      return { items: [], page, pageSize, total: 0, totalPages: 0 }
    }

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
    if (opts?.resolveMedia) await this.resolveMediaUrls(collection, items)
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
    opts?: { resolveRelations?: boolean; resolveMedia?: boolean }
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
    if (opts?.resolveMedia) await this.resolveMediaUrls(collection, [dto])
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
   * Swap each MEDIA field's stored **media id** for the media's public URL, so a
   * record bound to an image field renders on a public page (a CollectionList
   * card, say) without the caller having to paste a full URL. Values that are
   * already a URL (http(s):// or root-relative `/…`) are left untouched, so a
   * pasted URL keeps working; an unknown/deleted id is left as-is (a broken
   * image beats swallowing the field). Public render paths only (opt-in via
   * `resolveMedia`); admin/v1 keep the raw id. Batched to avoid N+1.
   */
  private async resolveMediaUrls(collection: CmsCollection, dtos: CmsRecordDto[]): Promise<void> {
    if (!dtos.length) return
    const mediaFields = collection.fields.filter((f) => f.type === 'MEDIA')
    if (!mediaFields.length) return

    const isUrl = (s: string) => /^(https?:)?\/\//.test(s) || s.startsWith('/')
    const ids = new Set<string>()
    for (const field of mediaFields) {
      for (const dto of dtos) {
        const v = dto.data[field.key]
        if (typeof v === 'string' && v && !isUrl(v)) ids.add(v)
      }
    }
    if (!ids.size) return

    const { default: MediaService } = await import('#services/media_service')
    const media = new MediaService()
    const urlById = new Map<string, string>()
    await Promise.all(
      [...ids].map(async (id) => {
        try {
          const dto = await media.findOne(id)
          if (dto?.url) urlById.set(id, dto.url)
        } catch {
          // Unknown/deleted media id — leave the stored value untouched.
        }
      })
    )
    if (!urlById.size) return

    for (const field of mediaFields) {
      for (const dto of dtos) {
        const v = dto.data[field.key]
        if (typeof v === 'string' && urlById.has(v)) dto.data[field.key] = urlById.get(v)!
      }
    }
  }

  /**
   * The id of a collection's single existing record (most-recent first), or
   * null if it has none yet. Used to route single types straight to their entry.
   */
  async findSoleRecordId(collectionKey: string): Promise<string | null> {
    const { table, collection } = await this.resolveRecordContext(collectionKey)
    // Runs during admin SSR for single-type collections; a missing physical table
    // (legacy/zombie) would otherwise 500 the whole page. Treat it as "no record".
    if (collection.source === 'DYNAMIC' && !(await db.connection().schema.hasTable(table))) {
      return null
    }
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
      .first()
    if (!collection) {
      throw new Error(
        isBuiltinCollectionKey(collectionKey)
          ? `"${collectionKey}" is a built-in collection managed by its module (not writable through the records API) — use a custom collection for arbitrary data`
          : `Collection "${collectionKey}" not found`
      )
    }

    if (collection.source === 'PRISMA' && collectionKey === 'user') {
      throw new Error('User records must be created via Admin → Users')
    }
    this.assertNotMetadataOnly(collection)

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
      payload[col] = serializeFieldValue(field.type, val)
    }

    // The row insert, relation sync and initial revision commit together, so a
    // relation/revision failure never leaves an orphan record behind.
    let insertedId: string
    const trx = await db.transaction()
    try {
      await trx.table(table).insert(payload)
      const resolvedId =
        id ?? (await trx.from(table).orderBy('id', 'desc').select('id').first())?.id
      if (!resolvedId) throw new Error('Failed to create record')
      insertedId = String(resolvedId)

      await this.syncMultiRelations(collection, insertedId, data, trx)

      if (collection.revisionsOn) {
        await CmsRevision.create(
          {
            id: newUlid(),
            collectionKey,
            recordId: insertedId,
            data: this.redactWriteOnly(collection, data),
            status: status as 'DRAFT' | 'PUBLISHED',
            authorId,
          },
          { client: trx }
        )
      }
      await trx.commit()
    } catch (e) {
      await trx.rollback()
      throw this.rethrowDbError(e)
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
      .first()
    if (!collection) {
      throw new Error(
        isBuiltinCollectionKey(collectionKey)
          ? `"${collectionKey}" is a built-in collection managed by its module (not writable through the records API)`
          : `Collection "${collectionKey}" not found`
      )
    }

    if (collection.source === 'PRISMA' && collectionKey === 'user') {
      throw new Error('User records must be updated via Admin → Users')
    }
    this.assertNotMetadataOnly(collection)

    const table = this.tableForCollection(collection)
    const existing = await db.from(table).where('id', id).whereNull('deleted_at').first()
    if (!existing) throw new Error('Record not found')

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (dto.status !== undefined) payload['status'] = dto.status

    let preparedData: Record<string, unknown> | null = null
    if (dto.data) {
      const data = this.prepareRecordData(collection, dto.data, { partial: true })
      preparedData = data
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
        payload[col] = serializeFieldValue(field.type, data[field.key])
      }
    }

    // The scalar update, relation re-sync and revision commit together. This
    // matters most for relations: syncMultiRelations deletes existing join/inverse
    // rows before re-inserting, so without a transaction a mid-sync failure would
    // permanently wipe a record's relations while the caller sees an error.
    const trx = await db.transaction()
    try {
      await trx.from(table).where('id', id).update(payload)

      if (preparedData) {
        await this.syncMultiRelations(collection, id, preparedData, trx)
      }

      if (collection.revisionsOn) {
        const updated = await trx.from(table).where('id', id).first()
        const fieldData: Record<string, unknown> = {}
        for (const field of collection.fields) {
          const col = this.fieldToColumn(collection, field.key)
          fieldData[field.key] = updated?.[col] ?? null
        }
        await CmsRevision.create(
          {
            id: newUlid(),
            collectionKey,
            recordId: id,
            data: this.redactWriteOnly(collection, fieldData),
            status: (updated?.status ?? 'DRAFT') as 'DRAFT' | 'PUBLISHED',
            authorId,
          },
          { client: trx }
        )
      }
      await trx.commit()
    } catch (e) {
      await trx.rollback()
      throw this.rethrowDbError(e)
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
    // A missing physical table (half-created collection) has no records to trash.
    if (collection.source === 'DYNAMIC' && !(await db.connection().schema.hasTable(table))) {
      return []
    }
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
    this.assertNotMetadataOnly(collection)
    return { table: this.tableForCollection(collection), collection }
  }

  /**
   * A metadata-only collection owns no table of its own — its "records" are the
   * built-in editor's rows (Content posts / ecommerce Products), not generic CMS
   * records. Guards every records path so a stray call can't hit a non-existent
   * `cms_<key>` table.
   */
  private assertNotMetadataOnly(collection: CmsCollection): void {
    if (isMetadataOnly(collection.type)) {
      const where =
        collection.type === 'PRODUCT' ? 'Admin → E-commerce → Products' : 'Admin → Content'
      throw new Error(
        `"${collection.key}" is a ${METADATA_TYPE_CONFIG[collection.type].label}-type collection — its entries are managed in ${where}, not as generic records`
      )
    }
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

  private async createDynamicTable(
    key: string,
    fields: CmsField[],
    trx?: TransactionClientContract
  ): Promise<void> {
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

    await (trx ?? db).rawQuery(`CREATE TABLE IF NOT EXISTS "${table}" (${cols.join(', ')})`)
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
        out[field.key] = coerceFieldValue(field, out[field.key])
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
        const raw = rest[col] ?? rest[field.key] ?? null
        // JSON-backed columns come back parsed on Postgres (JSONB) but as a raw
        // string on SQLite (TEXT) — parse so arrays/objects are consistent.
        if (
          typeof raw === 'string' &&
          (field.type === 'JSON' ||
            field.type === 'REPEATABLE' ||
            field.type === 'COMPONENT' ||
            field.type === 'MULTISELECT')
        ) {
          try {
            data[field.key] = JSON.parse(raw)
          } catch {
            data[field.key] = raw
          }
        } else {
          data[field.key] = raw
        }
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
      type: col.type ?? 'COLLECTION',
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
