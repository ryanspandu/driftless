# CMS content modeling

Strapi-grade content modeling on top of the base [CMS](./cms.md): a full field-type
catalog, **single types**, **relations** (all four cardinalities), **components**
(inline + a reusable registry), and **per-field width** layout.

Everything is built on the base architecture — **one dynamic collection = one
PostgreSQL table (`cms_<key>`), one field = one column** — with structured values
(JSON, components, multi-relations) stored as `JSONB` or resolved across tables.

> Scope note: **Dynamic Zone is intentionally not built** — the Puck
> [pages builder](./pages-builder.md) already covers visual block composition.
> Components cover structured groups on collection records.

---

## 1. Field types

`CmsFieldType` lives in `app/services/cms_service.ts` (and mirrored in
`inertia/types/api.ts`). Each type has an entry in:

- **`FIELD_REGISTRY`** (`cms_service.ts`) — SQL column type + `allowsUnique`/`allowsIndex`.
- **`FIELD_TYPE_META`** (`inertia/components/cms/field-type-picker.tsx`) — icon, description, tone, Default/Advanced tab.
- **`FieldRenderer`** (`inertia/components/cms/field-renderer.tsx`) — the record-form input.

| Type | Column (PG) | Input | Notes |
|------|-------------|-------|-------|
| `TEXT` | TEXT | text | single line; uniquable |
| `TEXTAREA` | TEXT | textarea | multi-line plain |
| `RICHTEXT` | TEXT (JSON) | rich editor | TipTap document |
| `SLUG` | TEXT | text | auto-generated from `config.source` when blank |
| `EMAIL` | TEXT | email | validated in `coerceFieldValue` |
| `NUMBER` | DOUBLE PRECISION | number | float |
| `INTEGER` | BIGINT | number | parsed to int in `coerceFieldValue` |
| `DECIMAL` | DOUBLE PRECISION | number | parsed to float |
| `BOOL` | BOOLEAN | checkbox | |
| `DATE` / `DATETIME` | DATE / TIMESTAMPTZ | date / datetime | datetime stored UTC |
| `SELECT` | TEXT | dropdown | values in `config.options` |
| `PASSWORD` | TEXT | password | **write-only**, hashed (see below) |
| `MEDIA` | TEXT | media picker | stores a media id |
| `JSON` | JSONB | JSON editor | freeform |
| `REPEATABLE` | JSONB | raw JSON | **legacy** — superseded by `COMPONENT` |
| `RELATION` | (varies) | record picker | see [§3](#3-relations) |
| `COMPONENT` | JSONB | structured editor | see [§4](#4-components) |

### Password (write-only)

`PASSWORD` is hashed with `hash.make()` on create/update and **never returned**:
`redactWriteOnly()` nulls it in record DTOs and revisions. On update, a blank
submission is **leave-blank-to-keep** (the existing hash is not overwritten).

### Email / Integer / Decimal

Stored as plain columns; `coerceFieldValue()` validates the email shape and parses
`INTEGER`/`DECIMAL` to numbers before write.

---

## 2. Collection kind: Collection vs Single type

A collection has a `kind`: `'collection'` (many entries) or `'single'` (exactly one,
e.g. a homepage or global settings).

| Piece | Location |
|-------|----------|
| Column | `cms_collections.kind` (migration `1761885935300_add_cms_collection_kind.ts`, default `'collection'`) |
| Model / DTO | `cms_collection.ts`, `CmsCollectionDto` |
| Service | `createCollection`/`updateCollection`/`collectionToDto`; `findSoleRecordId()` |
| Guard | `createRecord` rejects a 2nd entry: *"single type … can only have one entry"* |
| Routing | `cms_controller`: `recordsPage`/`newRecordPage` **redirect** single types |
| UI | Settings "Type" switch (`collection_detail.tsx`), new-collection checkbox, grid "Single" badge |

**Routing behavior** (no list view for single types): visiting `/admin/cms/:key`
redirects to the sole record's editor, or to `/admin/cms/:key/new` if none exists.
We deliberately **do not auto-create** an empty record (it would fail required-field
validation) — the user fills required fields and saves the first/only entry.
Relies on Inertia following a `302` GET→GET redirect.

---

## 3. Relations

`RELATION` links entries to another **dynamic** collection. The cardinality
(`CmsRelationType`) decides storage:

| Cardinality | Storage | On target delete |
|-------------|---------|------------------|
| `manyToOne` | FK column on the source row | `SET NULL` |
| `oneToOne` | FK column on the source row + `UNIQUE` | `SET NULL` |
| `manyToMany` | join table `cms_<src>_<key>` (`source_id`,`target_id`, composite PK) | `CASCADE` |
| `oneToMany` | inverse FK column `<src>_<key>` on the **target** table | `SET NULL` |

**Config** (`field.config`): `{ targetKey, relationType, joinTable?, inverseColumn? }`.

### Schema DDL — `addRelationField()` / `deleteField()`

All relation DDL is wrapped in a **`db.transaction()`** (the `CmsField` row + the
`ALTER`/`CREATE` commit together) — the base CMS has no transactions, so relations
add their own. `deleteField` drops the FK column / join table / inverse column for
real (not a soft archive) so a dangling constraint can't block later changes.

### Read / write

- **Single-FK (`manyToOne`/`oneToOne`)** need *no special code* — the FK is just a
  `TEXT` column holding one id, written/read through the normal column path; the DB
  FK enforces validity.
- **Multi (`manyToMany`/`oneToMany`)** live **outside** the row. They are:
  - skipped in the `createRecord`/`updateRecord` payload loops,
  - written by **`syncMultiRelations()`** after insert/update (m2m = delete+`multiInsert` pairs; o2m = null-then-repoint the target FK),
  - read by **`resolveMultiRelations()`** (cross-table query → id arrays), called from `listRecords`/`findRecord`/`createRecord`/`updateRecord`.

### UI

Single entry point — Relation is a card in the **Add field** picker
(`collection_detail.tsx` → `AddFieldDialog`), with a target + cardinality config
step. In the field list, relations render in their **own "Relations" section**
(`RelationFieldRow`, non-draggable). In the record form
(`field-renderer.tsx` → `RelationField`): single-FK = a single-select; multi =
`RelationMultiField` (searchable checkbox list).

**Limitations:** revisions don't capture m2m/o2m (no row column → stored as null);
the record picker is capped at 100 target entries.

---

## 4. Components

A **component** is a reusable group of fields, stored as `JSONB` on the record
(single = object, repeatable = array of objects). Two ways to define the schema:

### 4a. Inline components

`field.config = { repeatable: boolean, fields: [{ key, label, type }] }`. The schema
is edited right in **`AddFieldDialog`** via
`ComponentSchemaEditor` (`inertia/components/cms/component-schema-editor.tsx`).

### 4b. Reusable registry

Define a component once and reference it from many collections.

| Piece | Location |
|-------|----------|
| Table | `cms_components` (migration `1761885935400_create_cms_components.ts`) |
| Model | `app/models/cms_component.ts` |
| Service | `CmsService` — `listComponents`/`create`/`update`/`deleteComponent` (+ `normalizeComponentFields`) |
| Controller / routes | `cms_controller` component endpoints; `/admin/cms/components` + `/api/admin/cms/components` (`cms:manage`) |
| Admin UI | `inertia/pages/admin/cms/components.tsx` (card grid + create/edit dialog) |
| Client / hooks | `cmsComponents` in `lib/cms/client.ts`; `inertia/hooks/api/use-cms-components.ts` |
| Nav | sidebar "Components" (Boxes icon) |

A referencing field stores `field.config = { repeatable, componentKey }`. The
**Add field** dialog offers a **Saved component / Define inline** toggle.

> **Route order matters:** `/admin/cms/components` is registered **before**
> `/admin/cms/:key` in `start/routes.ts`, otherwise `"components"` is captured as a
> collection key.

### Editor & resolution

`field-renderer.tsx` → `ComponentField` renders the group, recursing into
`FieldRenderer` per sub-field (`toSubFieldDto` synthesizes a `CmsFieldDto`).
Repeatable adds add/remove/move-up-down per item. The schema is resolved from the
**registry** (`useCmsComponentsList`, when `config.componentKey` is set) or from
inline `config.fields`.

**Sub-field types are scalar-only** (`COMPONENT_SUBFIELD_TYPE_OPTIONS`): no
relation/password/nesting. The backend enforces this in `normalizeComponentFields`.

**Delete guard:** a component referenced by any collection field can't be deleted
(`deleteComponent` scans `cms_fields` for `config.componentKey`).

**No backend create/update special-casing** — components serialize like any JSONB
field. The registry is purely a schema source.

---

## 5. Per-field width (layout)

Each field carries a layout width in `field.config.width`:
`'full' | 'half' | 'third'` → col-span `6 / 3 / 2` on a **6-column grid** (default
full = one per row). Helpers live in **`inertia/lib/cms/field-width.ts`**
(`fieldWidthOf`, `widthSpanClass`, `WIDTH_OPTIONS`, …) and are shared by **both**:

- **Schema editor** (`collection_detail.tsx`) — the Fields list is a
  `sm:grid-cols-6` grid with dnd-kit **`rectSortingStrategy`** (2-D drag: sideways +
  vertical). A per-row width dropdown persists via `useUpdateCmsField` (which does an
  **optimistic** `onMutate` so changes apply instantly). Because `updateField`
  **replaces** config, the handler sends `{ ...field.config, width }`.
- **Record form** (`record-form.tsx`) — each `FieldRenderer` is wrapped in
  `widthSpanClass(fieldWidthOf(field))` inside the same `sm:grid-cols-6` grid.

So a field's width drives layout in both the schema editor and the entry form. On
mobile (`< sm`) everything collapses to one column.

---

## File map

| Concern | Files |
|---------|-------|
| Types / registry | `app/services/cms_service.ts` (`CmsFieldType`, `CmsRelationType`, `FIELD_REGISTRY`), `inertia/types/api.ts` |
| Relations | `cms_service.ts` (`addRelationField`, `resolveMultiRelations`, `syncMultiRelations`) |
| Components (backend) | `app/models/cms_component.ts`, `cms_service.ts` (component CRUD) |
| Field picker | `inertia/components/cms/field-type-picker.tsx` |
| Component schema editor | `inertia/components/cms/component-schema-editor.tsx` |
| Record inputs | `inertia/components/cms/field-renderer.tsx` (`RelationField`, `RelationMultiField`, `ComponentField`) |
| Width helpers | `inertia/lib/cms/field-width.ts` |
| Collection editor | `inertia/pages/admin/cms/collection_detail.tsx` |
| Components admin | `inertia/pages/admin/cms/components.tsx` |
| Hooks / client | `inertia/hooks/api/use-cms-components.ts`, `lib/cms/client.ts` |

## Migrations

| Migration | Adds |
|-----------|------|
| `1761885935300_add_cms_collection_kind.ts` | `cms_collections.kind` |
| `1761885935400_create_cms_components.ts` | `cms_components` table |

Relation join tables / FK columns and component JSONB columns are created at
**runtime** via `addField` DDL (like all dynamic columns), not via migrations.

## Adding a new field type (checklist)

1. Add to the `CmsFieldType` union in `cms_service.ts` **and** `inertia/types/api.ts`.
2. Add a `FIELD_REGISTRY` descriptor (SQL type + unique/index flags).
3. Add a `FIELD_TYPE_META` card (icon, description, Default/Advanced).
4. Add a `FieldRenderer` case for the record-form input.
5. If it needs coercion/validation, extend `coerceFieldValue`.
6. If it stores structured/out-of-row data, follow the relation/component pattern
   (skip in the payload loop + a sync/resolve pass).
