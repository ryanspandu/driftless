# Changelog — 2026-09 batch (`develop`)

A summary of the features shipped this session, with pointers to the full docs.
Commits: `2d478a7`, `dab07d3`, `9359ced`, `5bb7d8c`, `c4954e4`, `0922d13`,
`5e0bd7b`, `509ad24`, `82d5a5a`.

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

## 9. Content posts by taxonomy on an archive override — `5e0bd7b`

- A **`CollectionList` bound to `posts`** on a category/tag archive-override page
  now **auto-lists that taxonomy's posts** — it inherits the archive route's
  `{ slug, kind }` binding and filters to the category/tag; a normal page is
  unaffected. Mirrors how the e-commerce `ProductList` inherits its archive.
- Query layer: `BuiltinRecordQuery.categorySlug`/`.tagSlug` → `whereExists` pivot
  join applied to **both** the list and the count query; records API
  `GET /api/public/cms/posts/records?category=&tag=`. Client and SSR cache keys
  embed the taxonomy identically so SSR-preloaded rows are reused (no refetch).
  Gated-post body withholding is preserved in the list.
- Docs: [content-taxonomy-and-visibility.md](./content-taxonomy-and-visibility.md#listing-the-taxonomys-posts-on-the-override-page).

## 10. MCP: assign builder pages as archives — `509ad24`

- **`use_page_as_role`** (`PUT /api/mcp/v1/page-roles`) writes a core page-role
  slot — home, the auth/error screens, and the content **category/tag archives** —
  via `WebSettingsService.applyPatches`.
- **`set_storefront_page`** (`PUT /api/mcp/v1/storefront-pages`) sets an
  e-commerce storefront screen (shop, product, cart/checkout/account, category/tag)
  through the guarded dynamic-import boundary; needs the `ecommerce` module +
  `ecommerce:settings:manage`.
- Both are gated by the **`builder:settings`** ability, validate a
  **PUBLISHED + BUILDER** target, clear the slot on an empty `pageId`, and are
  mirrored into both the in-app and stdio tool manifests.
- Docs: [modules/mcp/README.md](../../modules/mcp/README.md#builder-api-reference).

## 11. Pin a Content posts list to a fixed category/tag — `82d5a5a`

- A `posts` **CollectionList** gains a **Post taxonomy** field
  (`taxonomy` prop `{ categorySlug?, tagSlug? }`, two dropdowns of the existing
  terms) that pins the list to a fixed category and/or tag on **any** page — not
  just an archive override. Both slugs **AND** together.
- An explicit pin **wins** over the archive route binding: `withArchiveTaxonomy`
  and the SSR resolver loop are now **fill-only**. Client + SSR cache keys carry
  the pin identically (no refetch). MCP block catalog re-emitted.
- Docs: [content-taxonomy-and-visibility.md](./content-taxonomy-and-visibility.md#3-category--tag-archive-overrides-use-as-page).
