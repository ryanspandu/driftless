# Content taxonomies & post visibility

**Status:** implemented (2026-09).

Three related features on the built-in **Content** posts (the `contents` table — a
first-class type, separate from generic CMS collections):

1. **Categories** — a hierarchical taxonomy (`/category/:slug` archives by default).
2. **Tags** — a flat taxonomy (`/tag/:slug` archives by default).
3. **Post visibility** — Public / Protected (password) / Member-only, enforced
   server-side.

Plus **archive overrides**: an operator can render a builder page in place of the
built-in category/tag archive, and **configurable URLs**: the blog screens can be moved
to another prefix (see [Configurable blog URLs](#configurable-blog-urls)).

> **URLs in this document are the defaults.** `/blog`, `/posts/:slug`, `/category/:slug` and `/tag/:slug`
> are what an untouched install serves; the operator can move any of them under
> **Website settings → URLs** — see [Configurable blog URLs](#configurable-blog-urls).

> The e-commerce module has its own parallel Categories + Tags for **products**,
> archived under `/shop/…` so they never collide with these root archives. See
> [modules/ecommerce/README.md](../../modules/ecommerce/README.md).

---

## 1. Categories (hierarchical) & Tags (flat)

### Human guide

- Manage them at **/admin/content/categories** and **/admin/content/tags** (a
  DataTable each: name, slug, description; categories also have an optional
  **parent**). Slugs auto-derive from the name and are kept unique.
- Assign them to a post in the content editor via multi-select cards (inline
  create + a link to the manager).
- Each has a public archive listing its **published** posts, newest first:
  `/category/:slug` and `/tag/:slug` (by default — the prefixes are configurable). A category archive
  shows only that category's own posts (children are not rolled up).

### Models & tables

| Concern | Category | Tag |
|---|---|---|
| Model | `app/models/content_category.ts` | `app/models/content_tag.ts` |
| Table | `content_categories` | `content_tags` |
| Pivot | `content_post_category` (`content_id`,`category_id`, composite PK, `CASCADE`) | `content_post_tag` (`content_id`,`tag_id`, composite PK, `CASCADE`) |
| Service | `app/services/content_category_service.ts` | `app/services/content_tag_service.ts` |
| Hierarchy | `parent_id` FK → self, `onDelete('SET NULL')`; `belongsTo parent` / `hasMany children` | flat (no parent) |

Both use **string (ULID) PKs** (`selfAssignPrimaryKey`), a unique `slug`,
`position`, and soft-delete via `deleted_at`. A category **cannot be its own
parent** (guarded in `update`; a fuller cycle check is intentionally skipped).
Deleting a category re-parents its children to null (`parent_id = null`), not
cascade-deletes them.

### Routes

Admin API (behind `middleware.permission({ resource: 'content' })`, same group as
every `/api/admin/content*` route):

| Method + path | Action |
|---|---|
| `GET /api/admin/content-categories` | list |
| `POST /api/admin/content-categories` | create (422 on validation error) |
| `PUT /api/admin/content-categories/:id` | update |
| `DELETE /api/admin/content-categories/:id` | delete |
| `GET/POST/PUT/DELETE /api/admin/content-tags[/:id]` | same shape for tags |

Admin pages: `GET /admin/content/categories`, `GET /admin/content/tags`
(Inertia — `admin/content/categories`, `admin/content/tags`).

Public archives: `GET /category/:slug`, `GET /tag/:slug`
(`public_controller.category` / `.tag` → `posts/category`, `posts/tag`). These are the
*historical* routes: when the operator has moved a prefix they **301** to the configured
address, and the configured address is served by the CMS catch-all through the same handlers
(see [Configurable blog URLs](#configurable-blog-urls)).

### DTOs

- `ContentCategoryDto` = `{ id, name, slug, description, parentId, position, ... }`;
  `ContentCategoryRef` = `{ id, name, slug }` (the lightweight form on posts).
- Tags mirror this without `parentId`.
- On a post, `ContentDto.categories` / `.tags` are `ContentCategoryRef[]` /
  `ContentTagRef[]`.

### External API (`/api/v1`)

`content_controller` create/update validators accept `categoryIds: string[]` and
`tagIds: string[]` (both optional). See [api-v1.md](./api-v1.md).

---

## 2. Post visibility (Public / Protected / Member)

### Human guide

The content editor's **Visibility** card sets one of:

- **Public** — anyone can read (default).
- **Protected** — gated by a password. A reader enters it once; the body then
  ships. Admins can **reveal** the stored password from the editor.
- **Member** — readable only by a logged-in visitor (any core admin user, or, if
  the store is on, a signed-in e-commerce customer).

Admins who can read content **bypass every gate** (this also covers preview).

### The security model — read this before touching it

Visibility is enforced **server-side**, not with a client flag over a
fully-shipped body. The invariant: **a locked post's body and resolved custom
fields never leave the server.**

- **Native columns, not custom fields.** Migration `1763000000000_add_visibility_to_contents.ts`
  adds `contents.visibility` (`varchar(20)`, default `'PUBLIC'`) and
  `contents.password_enc` (`text`, nullable). `ContentVisibility =
  'PUBLIC' | 'PROTECTED' | 'MEMBER'`.
- **Password at rest.** Stored as a reversible **AES encryption envelope** via
  Adonis `encryption.encrypt(password, undefined, 'content_post_password')` — a
  bound *purpose* string so the ciphertext can never be replayed into another
  encrypted column (mirrors `gateway_credentials_service`). It stays reversible
  on purpose, so an admin can recover/reveal it. Only a `PROTECTED` post carries
  one; switching away from Protected **nulls `password_enc`** so a stale password
  can never gate a later Public/Member post. Creating/keeping a Protected post
  without a password throws.
- **The gate (`public_controller`).** `post()` first loads only access metadata
  (`findAccessMetaBySlug` → `{ id, visibility, hasPassword }`), calls `lockFor()`,
  then loads the post with `findPublishedBySlug(slug, /* includeSecret */ locked === null)`.
  When locked, `includeSecret = false` and the service **blanks `body` and `data`**
  before the DTO is built — the payload carries only title/slug/visibility, enough
  to render the unlock prompt. `posts/show.tsx` turns the `locked` prop
  (`{ type: 'password' | 'member' } | null`) into a password form or a
  members-only panel.
- **Unlock flow.** `POST /posts/:slug/unlock` (`posts.unlock`) verifies the
  password with a **length-safe constant-time compare** (`timingSafeEqual`), then
  records the post id in the **signed, httpOnly** cookie `dl_unlocked`
  (`sameSite: 'lax'`, `maxAge: 7days`). On the next load the body ships.
  The route is **throttled** by `postUnlockThrottle` — keyed per **IP + post
  slug** (`start/limiter.ts`), so brute-forcing one post can't lock a visitor out
  of others.
- **Member check.** `isMember()` = `auth.user` present **OR** (when the
  `ecommerce` module is enabled, via a dynamic import so core keeps no static
  dependency) a resolved storefront account.
- **Admin reveal.** `GET /api/admin/content/:id/password` →
  `content_controller.revealPassword` → `ContentService.revealPassword(id)`
  decrypts and returns the plaintext, behind the same `content` permission group
  as every admin content route.

### Key service methods (`app/services/content_service.ts`)

| Method | Purpose |
|---|---|
| `findPublishedBySlug(slug, includeSecret = true)` | Public render; when `includeSecret=false`, body + data are withheld |
| `findAccessMetaBySlug(slug)` | `{ id, visibility, hasPassword }` without loading relations |
| `verifyPostPassword(slug, password)` | Constant-time compare against the decrypted stored password |
| `revealPassword(id)` | Admin-only decrypt for the editor's Reveal button |

### Content list (admin)

`inertia/pages/admin/content.tsx` gains **visibility** and **category** columns, a
featured-image **thumbnail**, and **bulk publish / unpublish / trash** actions.

---

## 3. Category / Tag archive overrides ("Use as page")

An operator can render a **builder page** in place of the built-in Inertia
archive, so the archive gets the full page builder (custom blocks, kits, layout).

- **Slots.** `page_role_slots.ts` adds `categoryArchive` and `tagArchive`, mapped
  to `web_settings` section **`content_pages`**, keys
  **`category_archive_page_id`** / **`tag_archive_page_id`**. `settings_service.ts`
  `WEB_DEFAULTS.content_pages` seeds **four** keys, all `''` (empty = use the built-in
  screen; the empty-string reset convention deletes the row) — these two, plus
  `posts_archive_page_id` / `post_detail_page_id` from §4. Mirrored in
  `inertia/types/api.ts`.
- **Render.** `public_controller.category` / `.tag` call
  `overrides.resolve('categoryArchive' | 'tagArchive')`. When a page is assigned
  and live, it is rendered via the page renderer with the slug **bound**
  (`bindings.params = { slug, kind: 'category' | 'tag' }`) and a `seoOverride`
  (title = taxonomy name, `canonicalPath` = the configured category/tag URL, e.g. `/category/:slug` by
  default) so an archive block on that page can filter to this taxonomy and SEO stays per-slug.
  Otherwise the built-in `posts/category` / `posts/tag` Inertia archive renders.

### Listing the taxonomy's posts on the override page

Drop a **`CollectionList` bound to `posts`** on the override page and it
**auto-lists that archive's posts** — no extra config. It reads the route
binding above and filters to the category/tag; on any other page the binding is
absent, so the same block behaves as a normal unfiltered posts list. (This
mirrors how the e-commerce `ProductList` inherits `/shop/category/:slug`.)

- **Query layer.** `BuiltinRecordQuery` gains `categorySlug?` / `tagSlug?`
  (`app/cms/builtin_collections.ts`); `posts_collection.ts` `list()` applies a
  `whereExists` pivot join (`content_post_category` → `content_categories` by
  slug, likewise tags) to **both** the list **and** the count query, so `total`
  and pagination stay correct. Reuses the pivot pattern from
  `content_category_service.publishedPostsInCategory`.
- **Records API.** `GET /api/public/cms/posts/records?category=<slug>` /
  `?tag=<slug>` (the runtime client-side fetch) — mirrors the e-commerce
  `/api/shop/products?category=&tag=` convention.
- **Binding inheritance (client + SSR in lockstep).**
  `inertia/puck/collection-list.tsx` reads `useBinding('slug')` /
  `useBinding('kind')` and threads the taxonomy through the query, fetch URL,
  and **cache key**; `app/services/page_data_resolver.ts` does the same on the
  SSR side (`resolvePageCollections(docs, { params })`), fed by
  `page_renderer.ts`. The server and client cache keys embed the taxonomy
  **identically** (`…|<categorySlug>|<tagSlug>`) so the SSR-preloaded rows are
  found and the client never silently re-fetches.
- **Withholding preserved.** A gated (Protected/Member) post still appears in the
  list with its body/excerpt/data blanked — the `toRecord` adapter withholds for
  any non-`PUBLIC` post, so the list can't leak a locked body.

**Pinning a fixed taxonomy (any page).** A `posts` CollectionList also has a
**Post taxonomy** field (`taxonomy` prop `{ categorySlug?, tagSlug? }`) — two
dropdowns of the existing categories/tags — so an author can pin the list to a
fixed category and/or tag on a normal page (both slugs **AND** together). An
explicit pin **wins** over the archive route binding: `withArchiveTaxonomy` (and
the SSR loop in `page_data_resolver`) fill only the slot the author left empty,
so a pinned block on an archive page shows its own taxonomy. Non-`posts`
collections ignore the field.

### Assigning archives via MCP

Both archive slots are reachable by an AI agent through the builder-API
(ability `builder:settings`):

- Core content archives — `PUT /api/mcp/v1/page-roles` with
  `role: "categoryArchive" | "tagArchive"` (tool `use_page_as_role`, which also
  covers home + the auth/error roles).
- E-commerce archives — `PUT /api/mcp/v1/storefront-pages` with
  `slot: "category" | "tag"` (tool `set_storefront_page`; needs the `ecommerce`
  module + `ecommerce:settings:manage`).

Both reject a non-PUBLISHED page (builder or CODE/kit) and clear the slot on an empty
`pageId`. See [modules/mcp/README.md](../../modules/mcp/README.md#builder-api-reference).

See [settings-ia.md](./settings-ia.md) for the `web_settings` key map and
[page-settings.md](./page-settings.md) for the "Use as page" overrides in general.

---

## 4. Blog index & post detail overrides ("Use as page")

Two more `content_pages` role slots, alongside the category/tag archives above —
the same override mechanism, applied to the posts listing (`/blog` by default) and to a
single post's page (`/posts/:slug` by default).

- **Slots.** `page_role_slots.ts` adds **`postsArchive`** (`posts_archive_page_id`)
  and **`postDetail`** (`post_detail_page_id`), both under `web_settings` section
  `content_pages` — same section as `categoryArchive`/`tagArchive`, empty string
  resets to the built-in screen. Mirrored in `inertia/types/api.ts`.
- **`postsArchive` — the posts index (`/blog` by default).** `public_controller.blog()` resolves the search
  query (`?q=`, server-side title/body match) **before** checking the override, so
  both branches share one result set. With an override assigned, the page
  renders via `PageRenderer` with the **full** searched result — `record: {
  items, total, query }` — where `items` is the **untrimmed** `PublicContentDto[]`
  (body, categories, tags, custom `data`), not the built-in listing's trimmed
  shape (id/title/slug/visibility/featuredImage/updatedAt). A CODE/kit page reads
  this to render an excerpt/category-chip/tag SSR instead of client-fetching; a
  builder page ignores `record` and shows its own configured content (same
  split as `ProductList` on `/shop`). `skipSnapshot: Boolean(q)` — caching the
  plain listing's HTML under the page id would otherwise serve stale results for
  every search. No `record` shape exists for a builder page today — there is no
  per-post block yet, so a builder blog index cannot show real post data (only a
  CODE/kit page can).
- **`postDetail` — the post page (`/posts/:slug` by default).** `public_controller.post()` resolves the
  visibility gate first (`lockFor()` / `findPublishedBySlug`) so the override and
  the built-in view share identical access control, **then** checks the
  override. With one assigned: `bindings.params = { slug }` (for a future
  per-post builder block), `record: { post, locked }` (the resolved,
  already-gated `PublicContentDto` **plus** the same `locked` flag the built-in
  view turns into a password/members prompt — a themed detail page never needs
  to re-check access or client-fetch by `?slug=`), and `seoOverride: { title:
  post.title, imageUrl: post.featuredImage, canonicalPath: <the configured post URL> }`
  (`contentPaths.urlFor('detail', post.slug)`) so every post gets its own `<title>`/canonical instead of sharing the
  template page's. `skipSnapshot: true` always — the page renders a different
  post per slug, so its SSG snapshot (keyed on the page id) must never cache
  under this route. Same caveat as the blog index: no per-post builder block
  exists yet, so a builder page here renders identically for every post — use a
  CODE/kit page for genuine per-post rendering.
- **A locked post stays locked behind an override.** The gate runs before the
  override check in both `blog()` (the listing withholds a gated post's
  body/excerpt via `toRecord`, same as an unfiltered `/blog`) and `post()` (a
  Protected/Member post's `record.post` carries the same blanked `body`/`data`
  and `record.locked` flag the built-in view uses) — assigning an override page
  never bypasses visibility.

### Assigning via MCP

Same tool as the category/tag archives — `PUT /api/mcp/v1/page-roles` /
`use_page_as_role` with `role: "postsArchive" | "postDetail"`.

---

## Configurable blog URLs

`Website settings → URLs` (`web_settings.content_paths`, tab `?tab=urls`) moves the built-in Content screens.
Defaults are the historical routes, so nothing changes until a value is set.

| Screen | Setting | Default |
|---|---|---|
| Posts archive | `posts_archive_prefix` | `blog` |
| Post page | `post_detail_prefix` | `posts` |
| Category archive | `category_prefix` | `category` |
| Tag archive | `tag_prefix` | `tag` |

- **Mechanism.** Routes are frozen at boot, so the configured prefix is matched in the CMS catch-all
  (`PagesPublicController.show` → `ContentPathsService.match`) and handed to the *same* `PublicController`
  handlers (`blog`/`post`/`category`/`tag`), with `ctx.params.slug` set and `blogSearchThrottle` applied by
  hand. The archive is an exact match; every other screen is `<prefix>/<one slug>`. The historical routes stay
  registered and **301** to the configured address when it differs (query string kept by
  `redirect.forwardQueryString`). `POST /posts/:slug/unlock` stays on its fixed URL; only its redirect-back
  follows the prefix.
- **Value rules.** A prefix is one or more `[a-z0-9-]` segments joined by `/` — it may be **nested**
  (`resources/insights`) — at most 120 characters. Values are **normalised** (trimmed, lower-cased, leading and
  trailing slashes stripped) and only the **last** patch per key counts, so the value that is validated is the
  value that is stored. An empty value resets the screen; a value equal to the default is stored as "no
  override" (no row). The posts archive and the post page **may share one prefix** (`/insights` +
  `/insights/:slug`); the post, category and tag prefixes may **not** share.
- **Validation** (`ContentPathsService.validate`, run from `WebSettingsService.applyPatches`, so it covers the
  admin screen, the data import **and** the MCP tools). Rejected: a malformed prefix, a reserved first segment
  (`reservedFirstSegment` — `app/services/reserved_paths.ts`), the *old* address of another moved screen, two
  `<prefix>/<slug>` screens on one prefix, a live Page or kit file-page under the prefix, and a collection's public
  detail prefix. Only non-default values are checked, so an untouched install is unaffected.
- **MCP.** Tools `get_content_paths` / `set_content_paths` (`GET` / `PUT /api/mcp/v1/content-paths`, ability
  `builder:settings`; body fields `postsArchive`, `postDetail`, `category`, `tag`; an empty string resets that
  screen). A validation problem is a `422` with the reason. See
  [modules/mcp/README.md](../../modules/mcp/README.md#builder-api-reference).
- **Precedence at runtime.** The catch-all order is: a Page on the exact path → a kit file-page → the configured
  content screen → a collection's public detail page → a configured redirect → 404. A Page on the exact path
  still wins over a content screen (this used to be silent — see the Pages guard below). A "no such post /
  category / tag" under a moved prefix does **not** end the lookup: it falls through to the collection detail
  lookup, then to redirects, then 404, so a manual 301 under the prefix works.
- **Pages guard.** `PagesService` (create, and update when the path changes) rejects a Page whose path is the
  archive prefix or lies under `<prefix>/` of any screen whose prefix has been **moved**
  (`ContentPathsService.pathConflict`), and any path under an enabled collection's detail prefix
  (`<prefix>/…` — the bare collection prefix is allowed, it may be that collection's list page). With the
  default prefixes nothing is enforced (the fixed routes `/blog`, `/posts/:slug`… already win). The data import
  writes pages directly and is not blocked.
- **Follows the prefix:** canonical + JSON-LD, the sitemap, the `posts` collection's `url` field, the shared
  `contentPaths` Inertia prop (built-in pages use `useContentPaths()`), and SSG snapshots (invalidated on write,
  only when a value really changed). A kit reads the same prop — `useContentPaths()` — instead of hard-coding
  `/insights`.
- **Not rewritten:** links an operator typed into menus, blocks or post bodies. The 301 keeps them working.
- **Import/export.** `content_paths` and `content_pages` travel with the **settings** section. Import applies
  `content_paths` in a separate step: a refusal (e.g. a collection's detail prefix on the target) is a
  **warning** in the import log — the rest of the settings still import. With conflict mode `skip`, the target's
  existing `content_paths` / `content_pages` values are kept. Unchanged values do not invalidate the SSG cache.
  A dry run reports the same problems as `[dry-run] warning (settings): …`.
- Code: `app/services/content_paths.ts` (pure defaults/normalise), `content_paths_service.ts` (read, match,
  validate, `pathConflict`), `inertia/lib/content_paths.ts` (`useContentPaths`), tests
  `tests/functional/content_paths.spec.ts`.

---

## Data transfer

Categories, tags, their pivots, and post visibility all round-trip through
import/export (`app/services/data_transfer/sections/content.ts`). The blog URLs
(`content_paths`) and the four `content_pages` role pointers travel with the **settings**
section — see [Configurable blog URLs](#configurable-blog-urls) for how an import treats them.

## Gotchas for AI agents

- **Never trust a client "unlocked" flag.** The body is withheld at the service
  layer; the only way to get a Protected body is the `dl_unlocked` signed cookie
  (or a member/admin session).
- Switching a post's visibility away from `PROTECTED` **wipes** the password.
- Category archives are **not** recursive — assigning a parent doesn't surface
  children's posts on the parent archive.
- Do not hard-code `/blog`, `/posts/…`, `/category/…` or `/tag/…` in new code: read the effective
  prefixes (`ContentPathsService` on the server, `useContentPaths()` in the UI). See
  [Configurable blog URLs](#configurable-blog-urls).
- A builder page assigned to `postsArchive`/`postDetail` cannot show real post
  data yet — there is no per-post builder block, so it just renders whatever is
  configured on it, identically for every post. Only a CODE/kit page reads
  `props.record`. Don't recommend a builder page for either slot if the operator
  wants actual post content on it.
- Reserved Content field keys now include `visibility` and `password` — a Content
  collection field can't shadow them (see [cms.md](./cms.md)).

## Related

- [cms.md](./cms.md) · [cms-content-modeling.md](./cms-content-modeling.md)
- [page-settings.md](./page-settings.md) · [settings-ia.md](./settings-ia.md)
- [auth-and-permissions.md](./auth-and-permissions.md) · [security.md](./security.md)
- [modules/ecommerce/README.md](../../modules/ecommerce/README.md) — product taxonomy + `/shop/…` archives
