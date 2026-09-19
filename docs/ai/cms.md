# CMS

Driftless includes a **dynamic collection** system (schema + records in PostgreSQL). All CMS collections are dynamic.

## Concepts

| Concept | Description |
|---------|-------------|
| Collection | A content type (key, label, icon, list config). `kind` = `collection` (many entries) or `single` (one entry) |
| Field | Typed column definition (TEXT, RICHTEXT, SELECT, SLUG, RELATION, COMPONENT, …) — full catalog in [cms-content-modeling.md](./cms-content-modeling.md) |
| Record | Row of JSON/data for a collection |
| Public detail pages | Opt-in per collection: each PUBLISHED record gets `/<prefix>/<slug>`, server-rendered through a template page — see below |
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
| Public detail pages — rules | `app/services/collection_detail_rules.ts` (validation of the `detail_*` settings; used by `CmsService` and by import) |
| Public detail pages — serving | `app/services/collection_detail_service.ts` (`resolve`, `sitemapEntries`), dispatched from `PagesPublicController.show`; sitemap source registered in `providers/cms_provider.ts` |
| Blog URLs the detail prefix must avoid | `app/services/content_paths.ts`, `content_paths_service.ts` (see [content-taxonomy-and-visibility.md](./content-taxonomy-and-visibility.md#configurable-blog-urls)) |
| Migration | `database/migrations/1763500000000_add_detail_pages_to_cms_collections.ts` — `detail_pages_on`, `detail_path_prefix`, `detail_page_id`, plus the partial unique index `cms_collections_detail_prefix_unique` (one prefix per live collection) |
| Data transfer | `app/services/data_transfer/sections/collection_detail.ts` (section 74) |

## Routes (summary)

| Area | Path prefix |
|------|-------------|
| Collections admin | `/admin/cms/collections`, `/api/admin/cms/collections` |
| Components admin | `/admin/cms/components`, `/api/admin/cms/components` (registered **before** `/admin/cms/:key`) |
| Records | `/admin/cms/:key`, `/api/admin/cms/:key/records` |
| Revisions | `.../records/:id/revisions`, restore endpoint |
| Public detail pages | `/<detail_path_prefix>/<slug>` — **not a registered route**: routes are frozen at boot, so the CMS catch-all (`GET *`) serves it through `CollectionDetailService` |

Collection schema routes require `cms:manage`. Record routes use `middleware.permission({ cmsRecord: true })` → `cms:{key}:read|create|update|delete`.

## Frontend

| Area | Location |
|------|----------|
| Collections list | `inertia/pages/admin/cms/collections.tsx` |
| Collection editor | `collection_detail.tsx` (Settings tab → **Public pages** section), `collections/new.tsx` |
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
`SELECT`/`MULTISELECT` (single vs multi-value, `Label : value` options),
`RELATION` (4 cardinalities), and `COMPONENT` (inline + registry) — plus per-field
**width** layout is documented in [cms-content-modeling.md](./cms-content-modeling.md).

**Reserved Content-type field keys.** A collection whose `source` is a Content type
cannot define fields whose keys the built-in Content editor owns natively:
`title`, `slug`, `body`, `status`, and now **`visibility`** and **`password`**
(`CONTENT_RESERVED_FIELD_KEYS` in `cms_service.ts`) — the latter two back the
post-visibility gate (see [content-taxonomy-and-visibility.md](./content-taxonomy-and-visibility.md)).

## Public detail pages (per collection, off by default)

Collection → **Settings → Public pages**. When on, every `PUBLISHED` record is served at
`/<detail_path_prefix>/<slug>` and rendered through a **CODE/kit template Page** (`detail_page_id`) — no
Page row per record, and a new record has a URL the moment it is published.

- **Settings:** `cms_collections.detail_pages_on` (default `false`), `detail_path_prefix` (one segment, unique
  among live collections — a partial unique index in the migration), `detail_page_id`. Editable in the admin,
  `create_collection` / `update_collection` (MCP) and travelling with a whole-site export (see
  [Import/export](#importexport) below).
- **Rules** (`collection_detail_rules.ts`, enforced in `CmsService.createCollection` / `updateCollection`):
  - a regular `COLLECTION` type and kind not `single`;
  - a **slug field** — a `SLUG`-typed field, else one with the key `slug` — that is **unique**. Records are
    looked up by slug, so two records may never share one. A field's *Unique* flag cannot be changed after
    creation: add a new SLUG field with Unique on. While the feature is on, the slug field cannot be deleted;
  - a **single-segment prefix** — lowercase letters, numbers, dashes; not reserved (`reservedFirstSegment`),
    not `posts` / `category` / `tag`, not the first segment of any configured blog prefix, and not the prefix
    of another live collection. A Page **under** an enabled collection's prefix (`<prefix>/…`) is refused by
    `PagesService` (the bare `/<prefix>` is allowed — it may be the collection's list page).
  - the **template Page must be a CODE page** (a builder page cannot render a record). This is checked
    **when the template is chosen**, inside the service (admin and MCP alike) — not on every save, and not on
    import. That it is **PUBLISHED** and that its **kit is active** are enforced only when serving (else 404).
- **Saving and turning it off.** An unchanged settings block is **not re-validated** on save, so a stale
  template or prefix never blocks renaming the collection. **Turning the feature off is never blocked**
  by a stale template or prefix (only the prefix's format and uniqueness are checked; the prefix and template
  are kept so it can be switched back on).
- **Trash → Restore** re-validates the prefix (blog, reserved, another collection). If it is no longer usable
  the collection comes back with the feature **OFF** and the prefix cleared.
- **Redirects.** Changing the prefix of an **enabled** collection records a `301` for each published entry's
  old URL (`RedirectsService.capturePathChange`; bounded to 1000 entries, a `console.warn` when truncated).
  Turning the feature off records none — the pages are gone by design. Renaming a published record's slug
  records a `301` (published → published only).
- **Serving:** in the CMS catch-all, after a Page / file-page / content-screen miss and **before** redirects
  and the 404 (`CollectionDetailService.resolve`). A Page on the exact path wins. Every unhealthy state —
  toggle off, no such/draft/trashed record, template missing/draft/not CODE, kit inactive, an unmigrated
  database — is a plain **404** (there is no built-in screen to fall back to). The lookup is an exact slug
  match (case-sensitive: an uppercase slug 404s) on the unique column, only for a two-segment path that
  missed every page; not cached. The response is never SSG-snapshotted (`skipSnapshot`).
- **The template Page stays reachable at its own path.** It renders there **with no record** (`props.record`
  is undefined) and is hidden from the sitemap (`seo_controller.rolePageIds`). Make the template tolerate that.
- **What the template receives** (`PageRenderer`): `props.bindings = { collection, slug }`,
  `props.record = { collection, item }` where `item` is the public record DTO (MEDIA as URLs, relations as
  labels — same as `/api/public/cms/:key/records`), **JSON-normalised** (dates are ISO strings on both
  databases; Postgres would otherwise hand a kit `Date` objects). The DTO carries **no URL** — a kit
  hard-codes the prefix it was built for. `props.path` is the *template's* path, so a router kit must branch
  on `bindings.collection` ([custom-templates.md](./custom-templates.md#collection-detail-pages-record-templates)).
- **SEO:** the record's own, field by field, by convention over the field keys — title = first of
  title/name/label/slug; description = `seo_description` → `description` → `summary` → `excerpt` →
  `subtitle` (200 chars); image = `seo_image` → `og_image` → `image` → `featured_image` → `cover` →
  `thumbnail` → first MEDIA field (absolute URL); canonical `/<prefix>/<slug>`. **Any field the record cannot
  supply falls back to the TEMPLATE page's SEO** — so keep the template's description empty or generic, and
  **never set `noindex` on it**: it would be inherited by every record and de-index the collection.
- **Sitemap:** published records of healthy collections (`registerSitemapSource('cms-collection-details')`):
  one narrow query per collection (slug + `updated_at`, no bodies or relations), capped at 50,000 URLs.
  Collections with an unhealthy template are left out; the template Page itself is hidden.
- Only PUBLISHED records are ever exposed; custom collections have no per-record visibility. Tests:
  `tests/functional/collection_detail_pages.spec.ts`.

### Import/export

A whole-site archive (`.driftless`) carries each collection's `detail_*` settings in its own section,
**`collection_detail`** (order 74 — after `pages` 60 and `settings` 70, before `kits` 75), not in `collections`
(30): the template Page id is only known once pages are imported (it is remapped in `regenerate` mode), and
the detail prefix is validated against the imported blog URLs. A prefix clash therefore never costs a
collection its table and records — the feature just stays OFF and the import log carries a warning. A missing
or unusable template Page (not imported, not a CODE page) enables the feature **without a template** (entry URLs
404 until one is chosen) and warns. `skip` keeps a target collection that already has its own configuration. A dry run checks it read-only
(`[dry-run] warning (collection_detail): …`). The per-collection JSON export from **Collections** carries
`detailPagesOn` + `detailPathPrefix` but no template id; importing it on a site that cannot host public pages
(prefix taken, no unique slug field) creates the collection with the pages OFF and toasts the reason. The
section registry is `app/services/data_transfer/registry.ts` (`DataSection`, incl. the optional read-only
`preflight` a dry run calls).

## Permissions

- `cms:manage` — collection/field CRUD
- `cms:{collectionKey}:{verb}` — record access per collection
- See [auth-and-permissions.md](./auth-and-permissions.md)

## Related

- [cms-content-modeling.md](./cms-content-modeling.md) — field types, single types, relations, components, per-field width
- [backend.md](./backend.md)
- [frontend.md](./frontend.md)
