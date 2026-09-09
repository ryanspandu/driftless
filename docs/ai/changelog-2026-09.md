# Changelog — 2026-09 batch (`develop`)

A summary of the features shipped this session, with pointers to the full docs.
Commits: `2d478a7`, `dab07d3`, `9359ced`, `5bb7d8c`, `c4954e4`, `0922d13`.

## 1. CMS `MULTISELECT` field + field-key auto-fill — `2d478a7`

- New **`MULTISELECT`** field type (multi-value `string[]`) alongside `SELECT`.
  Stored as **JSON** in a `JSONB` column (`TEXT` on SQLite), parsed back on read.
- `SELECT`/`MULTISELECT` options are now `{ label, value }[]`, edited as a
  **`Label : value` per-line textarea**; legacy `string[]` still read. Record
  input uses `AppSelect` / new **`AppMultiSelect`** (chips + searchable menu).
- Add-field dialog: **Key auto-fills from Label** (`keyFromLabel`) until
  hand-edited, with a live "available" hint.
- Reserved Content field keys now include **`visibility`** + **`password`**.
- Docs: [cms.md](./cms.md), [cms-content-modeling.md](./cms-content-modeling.md).

## 2–4. Content taxonomies, visibility & archive overrides — `dab07d3`

- **Categories** (hierarchical, `/category/:slug`) and **Tags** (flat,
  `/tag/:slug`) for built-in Content posts. Tables `content_categories` /
  `content_tags` + pivots `content_post_category` / `content_post_tag`; managers
  at `/admin/content/{categories,tags}`; multi-select in the editor.
- **Post visibility**: `contents.visibility` (`PUBLIC`/`PROTECTED`/`MEMBER`) +
  `contents.password_enc` (AES envelope, reversible for admin reveal). Body is
  **withheld server-side** until unlocked; `POST /posts/:slug/unlock` sets the
  signed `dl_unlocked` cookie (throttled per IP+slug); member = core user OR
  e-commerce customer; admins bypass.
- **Archive overrides**: assign a builder page to the category/tag archive
  (`web_settings.content_pages.{category,tag}_archive_page_id`).
- `/api/v1` content create/update accept `categoryIds` / `tagIds` / `visibility`
  / `password`.
- Docs: **[content-taxonomy-and-visibility.md](./content-taxonomy-and-visibility.md)**
  (new).

## 5. E-commerce product tags + `/shop/…` archives — `9359ced`

- Flat product **Tags** (`ecommerce_tags` + `ecommerce_product_tags`) mirroring
  Categories: manager page, product-editor multi-select, `CatalogService` CRUD +
  `tagIds`.
- Storefront **category/tag archives** at `/shop/category/:slug` and
  `/shop/tag/:slug` (default Inertia archive + builder-page overrides
  `setting.categoryPageId` / `setting.tagPageId`). `StorefrontQuery.tagSlug`,
  `PublicProductDto.tagSlugs`, `PublicTaxonomyDto`, `categoryBySlug`/`tagBySlug`.
- Docs: [modules/ecommerce/README.md](../../modules/ecommerce/README.md#product-tags--taxonomy-archives).

## 6. Template-kit activation toggle — `5bb7d8c`

- `template_kits` table + `TemplateKitState` model hold a per-kit `active` flag,
  **default `false` (fail-closed)**, read via `activeSet()` (10s cache).
- `PUT /api/admin/template-kits/:id/active` (`settings:manage`). Only **active**
  kits' code-templates, `kit:<id>` pages, file-pages and pickers surface; inactive
  file-page and `kit:<id>` routes **404 publicly**. Instant — **no rebuild**.
- Docs: [custom-templates.md](./custom-templates.md#activation-toggle--a-kit-is-fail-closed-until-switched-on).

## 7. Trash + restore for Templates & Menus — `5bb7d8c`, `c4954e4`

- `findTrashed` / `restore` / `forceDelete` on `TemplatesService` and
  `MenusService`; routes `/api/admin/{templates,menus}/{trash,:id/restore,:id/force}`;
  shared `TrashModal`; bulk delete relabelled **"Move to trash"**.
- Menu restore revives items in a transaction and re-uniques the handle
  (uniqueness resolved **before** the transaction to avoid a SQLite write-lock
  deadlock).
- Docs: [templates.md](./templates.md#trash--restore-templates-and-menus).

## 8. Standardised list URL params — `c4954e4`, `0922d13`

- All url-synced admin lists use **`?page=&pageSize=&q=`** (+ `sort`/`order`).
  DataTable `urlSync` gains **`includeQuery`** for tables whose page owns its own
  server-side `q`.
- Prefixed exceptions (multiple tables per route): **dashboard**, **apps/plugins
  settings**.
- Docs: [frontend.md](./frontend.md#list-url-param-convention).
