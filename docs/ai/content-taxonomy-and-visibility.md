# Content taxonomies & post visibility

**Status:** implemented (2026-09).

Three related features on the built-in **Content** posts (the `contents` table — a
first-class type, separate from generic CMS collections):

1. **Categories** — a hierarchical taxonomy (`/category/:slug` archives).
2. **Tags** — a flat taxonomy (`/tag/:slug` archives).
3. **Post visibility** — Public / Protected (password) / Member-only, enforced
   server-side.

Plus **archive overrides**: an operator can render a builder page in place of the
built-in category/tag archive.

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
  `/category/:slug` and `/tag/:slug`. A category archive shows only that
  category's own posts (children are not rolled up).

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
(`public_controller.category` / `.tag` → `posts/category`, `posts/tag`).

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
  `WEB_DEFAULTS.content_pages` defaults both to `''` (empty = use the built-in
  archive; the empty-string reset convention deletes the row). Mirrored in
  `inertia/types/api.ts`.
- **Render.** `public_controller.category` / `.tag` call
  `overrides.resolve('categoryArchive' | 'tagArchive')`. When a page is assigned
  and live, it is rendered via the page renderer with the slug **bound**
  (`bindings.params = { slug, kind: 'category' | 'tag' }`) and a `seoOverride`
  (title = taxonomy name, `canonicalPath = /category/:slug` or `/tag/:slug`) so an
  archive block on that page can filter to this taxonomy and SEO stays per-slug.
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

Scope note: only **auto-inheritance** on an archive-override page is wired.
Pinning a *fixed* taxonomy on a `CollectionList` sitting on a normal page is not
exposed as a block field (deferred).

### Assigning archives via MCP

Both archive slots are reachable by an AI agent through the builder-API
(ability `builder:settings`):

- Core content archives — `PUT /api/mcp/v1/page-roles` with
  `role: "categoryArchive" | "tagArchive"` (tool `use_page_as_role`, which also
  covers home + the auth/error roles).
- E-commerce archives — `PUT /api/mcp/v1/storefront-pages` with
  `slot: "category" | "tag"` (tool `set_storefront_page`; needs the `ecommerce`
  module + `ecommerce:settings:manage`).

Both reject a non-PUBLISHED / non-BUILDER page and clear the slot on an empty
`pageId`. See [modules/mcp/README.md](../../modules/mcp/README.md#builder-api-reference).

See [settings-ia.md](./settings-ia.md) for the `web_settings` key map and
[page-settings.md](./page-settings.md) for the "Use as page" overrides in general.

---

## Data transfer

Categories, tags, their pivots, and post visibility all round-trip through
import/export (`app/services/data_transfer/sections/content.ts`).

## Gotchas for AI agents

- **Never trust a client "unlocked" flag.** The body is withheld at the service
  layer; the only way to get a Protected body is the `dl_unlocked` signed cookie
  (or a member/admin session).
- Switching a post's visibility away from `PROTECTED` **wipes** the password.
- Category archives are **not** recursive — assigning a parent doesn't surface
  children's posts on the parent archive.
- Reserved Content field keys now include `visibility` and `password` — a Content
  collection field can't shadow them (see [cms.md](./cms.md)).

## Related

- [cms.md](./cms.md) · [cms-content-modeling.md](./cms-content-modeling.md)
- [page-settings.md](./page-settings.md) · [settings-ia.md](./settings-ia.md)
- [auth-and-permissions.md](./auth-and-permissions.md) · [security.md](./security.md)
- [modules/ecommerce/README.md](../../modules/ecommerce/README.md) — product taxonomy + `/shop/…` archives
