# Changelog — 2026-09 batch (`develop`)

A summary of the features shipped this session, with pointers to the full docs.
Commits: `2d478a7`, `dab07d3`, `9359ced`, `5bb7d8c`, `c4954e4`, `0922d13`,
`5e0bd7b`, `509ad24`, `82d5a5a`, `2091d96`, `be004ee`, `786891c`, `1e3abf3`, `4497876`,
`3cf8851`, `e904f81`.

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
  **PUBLISHED** target (builder or CODE/kit page), clear the slot on an empty `pageId`, and are
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

## 12. One rich-text editor everywhere (HTML), silent-data-loss fix — `2091d96`

- Product **Description**, CMS `RICHTEXT` custom fields and Task **Description** now use the full Content editor
  (`ArticleEditor`). The old, smaller `RichTextEditor` emitted TipTap **JSON** but `sanitizeRichText()` only
  accepts strings, so every `RICHTEXT` custom-field save was silently stored as `''`. All three now store
  sanitized **HTML** like `Content.body`.
- `Product.description` migrated `jsonb → text` (best-effort plain-text backfill); Task descriptions
  backfilled; both are now sanitized server-side. The sanitizer allowlist was widened to match the editor's
  toolbar (constrained inline styles, `youtube-nocookie` iframes, details, task lists).
- The Product editor remounts `ArticleEditor` once its async data arrives (it only reads `value` initially).
- **MCP:** `create_product`/`update_product` `description` is now an **HTML string** (was TipTap JSON) in both
  `modules/mcp/mcp_tools.ts` and the stdio mirror `modules/mcp/server/src/index.ts`.
- Docs: [security.md](./security.md#content-and-page-builder-html), [frontend.md](./frontend.md#ui-components).

## 13. Editor bubble toolbar follows scroll; `bare` editors get a border — `be004ee`

- TipTap's `BubbleMenu` only repositions on `window` scroll, but the admin scrolls inside `<main>`; the
  toolbar stayed stranded when scrolling. `ArticleEditor` now dispatches the plugin's `updatePosition` meta from
  every scrollable ancestor.

## 14. Modals: max height, pinned header/footer — `786891c`

- `DialogContent` is capped at 85vh; a direct-child header/footer stay pinned and only the body scrolls. Modals
  that lay out their own regions pass `bare`. Docs: [frontend.md](./frontend.md#ui-components).

## 15. "Applied to all products" discounts — `1e3abf3`, `4497876`

- A discount flagged `automatic` needs no code and lowers every product's price on the storefront and in the
  basket (per-unit percent, or fixed off each item in the base currency). It stacks with other automatic
  discounts and a shopper's code (summed, fitted to the subtotal); each records its own redemption.
- Storefront DTO `price` is the discounted figure, `compareAt` the list price, `automaticOff` the per-unit
  reduction. The product editor lists them above Categories with a per-product on/off switch (exclusion list on
  the discount). Discount form Starts/Ends use the shared `DatePicker`.
- **MCP:** there are no discount tools (products/variants/categories/tags only); `list_products` is unaffected.
- Docs: [modules/ecommerce/README.md](../../modules/ecommerce/README.md#automatic-applied-to-all-products-discounts).

## 16. Save feedback is a toast everywhere (admin + shopper account) — `e904f81`

- `QueryProvider` gained a global `MutationCache`: every failed mutation toasts the server's message, and
  `meta.successMessage` on a hook toasts success. `~/lib/notify` (`reportSuccess`/`reportError`, de-duplicating)
  covers non-react-query calls. ~110 files: inline "Saved" flashes and inline server-error blocks removed;
  `TrashModal`/`DeleteConfirmProvider` no longer swallow errors; a shared `<Toaster>` is mounted in every layout,
  the storefront branches and the kit-fields editor (whose toasts previously rendered nowhere). Cart, checkout
  and login/register stay inline. Docs: [frontend.md](./frontend.md#save-feedback-toasts).

## 17. Configurable blog URLs + collection public detail pages

- **Website settings → URLs** (`?tab=urls`, `web_settings.content_paths`): move `/blog`, `/posts/:slug`,
  `/category/:slug`, `/tag/:slug` (e.g. to `/insights`; a prefix may be nested, and the archive and the post page
  may share one). Matched in the CMS catch-all, the old routes **301** (query string kept), canonical / JSON-LD /
  sitemap / `posts` collection `url` / SSG snapshots follow, and the effective prefixes are the shared Inertia prop
  `contentPaths` (`useContentPaths()` in `inertia/lib/content_paths.ts`). Validation lives in
  `WebSettingsService.applyPatches`, so it covers the admin screen, the data import and the new MCP tools
  **`get_content_paths` / `set_content_paths`** (`/api/mcp/v1/content-paths`, `builder:settings`, `422` on a problem).
  `PagesService` now also refuses a Page under a moved prefix or under an enabled collection's detail prefix; a
  Page on the exact path still wins at runtime; "no such post/category/tag" falls through to redirects, then 404.
  `WEB_DEFAULTS.content_pages` seeds all four role keys. Docs:
  [content-taxonomy-and-visibility.md](./content-taxonomy-and-visibility.md#configurable-blog-urls).
- **Collections → Settings → Public pages** (`cms_collections.detail_pages_on/detail_path_prefix/detail_page_id`,
  default off): `/<prefix>/<slug>` per PUBLISHED record through a **CODE/kit template** (checked when chosen; a
  builder page is refused; PUBLISHED + active kit enforced when serving). Needs a **unique** slug field and a
  single-segment prefix that is not reserved, not the blog's and not another collection's. Per-record SEO with a
  fallback to the template's, sitemap (one narrow query per collection), 301s when a published record's slug or an
  enabled collection's prefix changes, restore-from-Trash re-validates the prefix (comes back OFF if unusable),
  turning it off is never blocked. MCP `create_collection` / `update_collection` carry the fields. Docs:
  [cms.md](./cms.md#public-detail-pages-per-collection-off-by-default).
- **Import/export:** a new data section **`collection_detail`** (order 74, after `pages` and `settings`) carries each
  collection's `detail_*` settings (template id remapped in `regenerate` mode) — `collections` no longer does, so
  a prefix clash can never cost a collection. `content_paths` is applied in its own step of the settings import: a
  refusal is a **warning**, the rest of the settings still import, and `skip` keeps the target's `content_paths` /
  `content_pages`. Section warnings now reach the import log (`⚠ <section>: …`) and are shown on the data-transfer
  screen; a dry run runs each section's optional read-only `preflight` (`[dry-run] warning (<section>): …`).
  `formatVersion` stays `1` (additive; an older build ignores the new section).
- **Kits:** the gitignored `aftrn-web` kit is a **router kit** — one `index.tsx` that tells its pages apart by props
  (`bindings.collection`, `record.post`, `record.items`, else the Page's `path`) — and the working reference for
  record templates. Docs: [custom-templates.md](./custom-templates.md#router-kits--one-indextsx-many-pages),
  [code-pages.md](./code-pages.md#record-templates-collection-detail-pages),
  [security.md](./security.md#content-and-page-builder-html) (what the rich-text sanitiser leaves a kit).
- Tests repointed from the gitignored `aftrn-web` kit to the committed `example` kit (`template_kit_active.spec.ts`).

## 18. A "Use as page" page's own slug is no longer a second address

A page standing in for a built-in screen (front page, sign in/up, forgot password, posts archive, post/category/
tag templates, a collection's detail template, and e-commerce shop/cart/checkout/order/account/sign-in/up and
product/category/tag templates) is a **template served at that screen's URL**. Its own `path` used to keep
answering too (`/static-bloom` *and* `/`, the seeded landing page at `/home` *and* `/`) — duplicate content the
sitemap already hid. Now the catch-all in `PagesPublicController.show` asks `PageRolesService.urlFor(page.id)`:

- role with a fixed URL → **301** to it, query string kept (`/static-bloom?x=1` → `/?x=1`);
- role without one (error pages, reset form, per-slug templates, detail templates) → **404**;
- the page's slug **is** the screen's URL (a `blog` page as the posts archive) → served as before;
- the role is cleared → the slug works again.

One source, two readers: `PageRolesService` (`app/services/page_roles_service.ts`) folds core's
`PAGE_ROLE_SLOTS`, collection detail templates and each enabled module's manifest **`pageRoles()`** (new optional
`ModuleManifest` field, read by shape — e-commerce implements it) into `pageId → URL | null`. The sitemap
(`SeoController`) now uses the same service instead of its own copy, which also removes its direct import of the
e-commerce model. The Pages list gets `liveUrl` on such rows so **View** opens the real URL (or previews the
template when there is none). Tests: `tests/functional/page_role_slug_hidden.spec.ts`, plus a case per storefront
slot in `modules/ecommerce/tests/ecommerce_storefront_overrides.spec.ts`.
