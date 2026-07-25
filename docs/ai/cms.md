# CMS

Driftless includes a **dynamic collection** system (schema + records in PostgreSQL). All CMS collections are dynamic.

## Concepts

| Concept | Description |
|---------|-------------|
| Collection | A content type (key, label, icon, list config). `kind` = `collection` (many entries) or `single` (one entry) |
| Field | Typed column definition (TEXT, RICHTEXT, SELECT, SLUG, RELATION, COMPONENT, …) — full catalog in [cms-content-modeling.md](./cms-content-modeling.md) |
| Record | Row of JSON/data for a collection |
| Revision | Point-in-time snapshot; restore via API |
| Component | Reusable group of fields (inline or from the `cms_components` registry) |

> **Content modeling** (full field types, single types, relations, components,
> per-field width) is documented separately in
> [cms-content-modeling.md](./cms-content-modeling.md). This page covers the base
> collection/record/revision system.

## Native registry (removed)

There are **no native collections**. Content, Media and Users used to be exposed as native (`source: 'PRISMA'`) collections, but were removed — they are managed exclusively through their dedicated admin pages (`/admin/content`, `/admin/media`, `/admin/users`). `NATIVE_COLLECTIONS` in `app/cms/native_registry.ts` is now empty and `providers/cms_provider.ts` reconciles nothing. Their authorization uses builtin permissions: `content:*`, `user:read`/`user:manage`, `media:read`/`media:manage` (see [auth-and-permissions.md](./auth-and-permissions.md)).

## IDs

- Collection/record IDs use **ULIDs** (`app/services/ulid_service.ts`).
- Legacy stack used ULIDs for users; driftless users use integer IDs after migration.

## Backend

| Piece | Location |
|-------|----------|
| Service | `app/services/cms_service.ts` |
| Permissions | `app/services/cms_permissions_service.ts` |
| Controller | `app/controllers/admin/cms_controller.ts` |
| Models | `app/models/cms_collection.ts`, `cms_field.ts`, `cms_revision.ts`, `cms_component.ts` |

## Routes (summary)

| Area | Path prefix |
|------|-------------|
| Collections admin | `/admin/cms/collections`, `/api/admin/cms/collections` |
| Components admin | `/admin/cms/components`, `/api/admin/cms/components` (registered **before** `/admin/cms/:key`) |
| Records | `/admin/cms/:key`, `/api/admin/cms/:key/records` |
| Revisions | `.../records/:id/revisions`, restore endpoint |

Collection schema routes require `cms:manage`. Record routes use `middleware.permission({ cmsRecord: true })` → `cms:{key}:read|create|update|delete`.

## Frontend

| Area | Location |
|------|----------|
| Collections list | `inertia/pages/admin/cms/collections.tsx` |
| Collection editor | `collection_detail.tsx`, `collections/new.tsx` |
| Records | `records.tsx`, `record_detail.tsx` |
| Schema UI | `inertia/components/cms/schema-builder.tsx` |
| Hooks | `inertia/hooks/api/use-cms-collections.ts`, `use-cms-records.ts` |

## Sidebar grouping

Each collection has a `group` attribute (editable via the "Group" combobox in the collection editor). The admin sidebar (`inertia/components/admin/sidebar.tsx`) renders collections by group:

- Empty/null `group` → the default **Collections** section.
- Each distinct `group` value → its own sidebar section (header = the group name), sorted alphabetically.

The sidebar filters to `source === 'DYNAMIC'` as a safety net; since native collections were removed, only dynamic collections exist anyway. Content / Media / Users live in the fixed top-level nav, not the collection sections.

Changing a collection's group invalidates the collections list query, so the sidebar updates without a reload.

## Field types

Defined in `cms_service` (`CmsFieldType`). UI renders per type in record forms and
the schema builder. The full catalog — scalars, `EMAIL`/`INTEGER`/`DECIMAL`/`PASSWORD`,
`RELATION` (4 cardinalities), and `COMPONENT` (inline + registry) — plus per-field
**width** layout is documented in [cms-content-modeling.md](./cms-content-modeling.md).

## Permissions

- `cms:manage` — collection/field CRUD
- `cms:{collectionKey}:{verb}` — record access per collection
- See [auth-and-permissions.md](./auth-and-permissions.md)

## Related

- [cms-content-modeling.md](./cms-content-modeling.md) — field types, single types, relations, components, per-field width
- [backend.md](./backend.md)
- [frontend.md](./frontend.md)
