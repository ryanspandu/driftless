# CMS

Driftless includes a **dynamic collection** system (schema + records in PostgreSQL) plus **native** collections defined in code.

## Concepts

| Concept | Description |
|---------|-------------|
| Collection | A content type (key, label, icon, list config) |
| Field | Typed column definition (TEXT, RICHTEXT, SELECT, SLUG, …) |
| Record | Row of JSON/data for a collection |
| Revision | Point-in-time snapshot; restore via API |
| Native collection | Declared in `app/cms/native_registry.ts`, synced on boot |

## Native registry

`NATIVE_COLLECTIONS` in `app/cms/native_registry.ts` defines built-in types (e.g. `content`). `providers/cms_provider.ts` reconciles them into `cms_collections` / `cms_fields` at boot when tables exist.

## IDs

- Collection/record IDs use **ULIDs** (`app/services/ulid_service.ts`).
- Legacy stack used ULIDs for users; driftless users use integer IDs after migration.

## Backend

| Piece | Location |
|-------|----------|
| Service | `app/services/cms_service.ts` |
| Permissions | `app/services/cms_permissions_service.ts` |
| Controller | `app/controllers/admin/cms_controller.ts` |
| Models | `app/models/cms_collection.ts`, `cms_field.ts`, `cms_revision.ts` |

## Routes (summary)

| Area | Path prefix |
|------|-------------|
| Collections admin | `/admin/cms/collections`, `/api/admin/cms/collections` |
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

## Field types

Defined in `cms_service` (`CmsFieldType`). UI renders per type in record forms and schema builder.

## Permissions

- `cms:manage` — collection/field CRUD
- `cms:{collectionKey}:{verb}` — record access per collection
- See [auth-and-permissions.md](./auth-and-permissions.md)

## Related

- [backend.md](./backend.md)
- [frontend.md](./frontend.md)
