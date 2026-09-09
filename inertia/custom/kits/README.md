# Custom template kits

A **kit** is a fully hand-coded page as one self-contained folder — the
WordPress-theme counterpart to a single-file code page under
`inertia/custom/pages/`. Everything a kit needs (React/TSX, styling,
sub-components, imported assets) lives in its own folder here.

## Anatomy

```
inertia/custom/kits/<name>/
  kit.json          required — marks the folder as a kit + names it for the picker
  index.tsx         a template a DB page points at (kit:<name>) — optional if you only ship pages/
  pages/*.tsx       file-pages — each file is a route with NO DB row (see below)
  templates/*.tsx   code chrome — header/footer/layout a page points at (codetpl:<kit>/<type>)
  collection/*.tsx  collection templates — one CMS record as code; filename = collection key
  emails/*.tsx      code EMAIL templates — a transactional email as code (codetpl:<kit>/email/<name>)
  components/…       optional — sub-components, imported with relative paths
  style/style.css   optional — kit-wide CSS, imported by index.tsx (see Styling)
  style/<page>.css  optional — CSS for ONE page, imported by that page
  assets/…           optional — images/fonts, IMPORTED (never referenced by raw path)
```

The committed **`example/`** kit is a complete reference: `index.tsx` (a template) **and** a
`pages/` folder (file-pages at `/kit-example/*`) sharing `components/page-shell.tsx`. Copy it,
rename it, and edit. Two pages are worked references for the sections below —
`pages/about.tsx` (+ `style/about.css`) for **per-page CSS**, and
`pages/performance.tsx` for the **performance** patterns.

## File-pages — a folder of routes, no database rows

Each `pages/*.tsx` is a standalone route served with no DB row. The filename is the URL path
(root-level; `index` → home), overridable with `export const path = 'company/about'`; the title
is the titleized filename, overridable with `export const title = '...'`. A database page always
wins on a path clash. File-pages are pure code (no editable region) and show in the admin pages
list as read-only rows. Full reference: [`docs/ai/custom-templates.md`](../../../docs/ai/custom-templates.md).

## Collection templates — render CMS records as code

Each `collection/<key>.tsx` draws **one** record of a collection as code. On a **Collection List**
block, set *Item design → Code template* and pick it (the **filename is the collection key** — a
`collection/posts.tsx` only offers itself on a list bound to `posts`). The component
default-exports `({ record }) => JSX` and gets the whole record — `record.data` holds the fields,
with `record.id` / `status` / `createdAt` / `updatedAt` alongside. Type the prop with
`CustomCollectionRecord` from `~/custom/registry`. See `example/collection/posts.tsx`.

## Email templates — a transactional email as code

Each `emails/<name>.tsx` is a transactional email authored in code — the coded twin of a
Puck-designed EMAIL template. Wire it to a mail event under **Settings → Email → Notifications →
Design**. The component default-exports `(vars: EmailVars) => JSX`; import the email-safe
primitives (`EmailRoot`, `EmailHeading`, `EmailText`, `EmailButton`, `EmailBody`, …) from
`~/custom/email_kit`. Read `vars.<name>` for the event's `{{placeholders}}`, and place one
`<EmailBody/>` where the service inserts the reset link / order table. Inline styles + literal hex
only (no Tailwind/oklch); it is flattened to HTML at BUILD time, so adding or editing one needs a
rebuild. See `example/emails/password_reset.tsx`.

- The **folder name is the id.** A page selects a kit by storing
  `component = "kit:<folder>"`; the public URL comes from the page record, not
  the folder.
- `kit.json` = `{ "name": "...", "description": "..." }` — shown in the
  create-page picker. Its presence is also what marks the folder as a kit.
- `index.tsx` receives `CodePageProps` (see `inertia/custom/types.ts`): `title`,
  `path`, `seo`, `header`, `footer`, `bindings`, `preview`. Wrap your markup in
  `<SiteChrome header footer>` to sit inside the real site header/footer, or omit
  it to own the whole viewport.
- Add `export const editableRegion = true` and render `<BuilderRegion />` to
  expose a slice of the page to the visual builder.

## Fetching CMS data (SSR first — a kit is a public, SEO-facing page)

A template kit is served to the public, so its dynamic data has to be **in the
server-rendered HTML** — a crawler (and an AI answer engine) reads the initial
response, and the largest text/image often IS a data row, so it also drives LCP.
**Default to SSR.** Fetch on the client only for things that genuinely don't
belong in the HTML.

### ✅ Recommended: SSR the data with a Collection List block

The **Collection List** block is preloaded on the server (`page_data_resolver`),
so its records are baked into the first response — indexable, no loading flash,
LCP-friendly. Two ways to reach it from a kit, both fully SSR:

1. **A builder page** — build the dynamic/SEO page in the page builder with a
   Collection List block. The operator points it at any collection (`posts`,
   `products`, or a CMS collection) and picks the design. Nothing to code.
2. **A code kit that owns the design** — add `export const editableRegion = true`
   and render `<BuilderRegion />`; the operator drops a Collection List block into
   that region. To render each record **in the kit's own markup** (not the
   generic card), ship a **collection template** `collection/<key>.tsx` — the
   operator sets the block's *Item design → Code template* and picks it. The
   filename is the collection key (`collection/posts.tsx` only offers itself on a
   `posts` list). This is the full pattern: **SSR data + your design + SEO**.
   Reference: `example/collection/posts.tsx`.

So a kit that wants an SSR blog/product grid = a `<BuilderRegion>` + a
`collection/<key>.tsx` template, or simply a builder page.

### ⚠️ Client-side: `useCollectionRecords` — NOT for SEO content

`useCollectionRecords(key, options)` / `useCollectionRecord(key, id)` from
`~/hooks/cms/use-collection-records` fetch published records at runtime over the
public API. They run **after hydration**, so the data is **absent from the SSR
HTML** — a crawler sees a blank/loading state, and the paint flashes empty.

```tsx
const { data, isLoading } = useCollectionRecords('posts', { limit: 6, sortDir: 'desc' })
// options: limit, page, sortField/sortDir, filterField+filterValue, search
```

Use it only for data that should NOT be indexed anyway: interactive filters,
"load more", search-as-you-type, personalised or account-specific content. For
anything a search engine should see, use the block path above. Reference:
`example/pages/collection-demo.tsx`.

### Which to use

| Need | Use | SSR / SEO |
|---|---|---|
| Blog index, product grid, any list a crawler should read | Collection List block (builder page, or region + `collection/<key>.tsx`) | ✅ server-rendered |
| Interactive filter / search / "load more" / personalised | `useCollectionRecords` (client) | ❌ after hydration |
| One record, code-owned card, SEO | `collection/<key>.tsx` template on a block | ✅ server-rendered |

The endpoints behind both (`GET /api/public/cms/:key/records[/:id]`, published-only)
are auto-documented at **`/api/docs`** (dev only). Full reference:
[`docs/ai/custom-templates.md`](../../../docs/ai/custom-templates.md) ·
[`docs/ai/cms.md`](../../../docs/ai/cms.md).

## Using the e-commerce module

Build a storefront the **decoupled** way: product cards via `useCollectionRecords('products')`, and
cart/checkout/**customer accounts** via plain `fetch('/api/shop/*')` — **never import the module**.
Cart is server-side, the client never sends a price, checkout redirects to a hosted gateway,
customer accounts are a separate login from the admin users (`GET /api/shop/me` never 401s),
`/shop/*` is reserved, and the API 404s when the store is off (degrade gracefully). See
`example/pages/shop-demo.tsx` + `example/pages/account-demo.tsx` + `example/components/shop_api.ts`,
and the full section in [`docs/ai/custom-templates.md`](../../../docs/ai/custom-templates.md).

## Rules

- **Use app libraries only.** Import anything already in the root `package.json`
  (React, Tailwind, TanStack Query, recharts, tiptap, dnd-kit, phosphor/lucide
  icons, …) and any `~/components` / `~/lib`. Do **not** `npm install` inside a
  kit — there is no per-folder dependency resolution.
- **Import your assets** (`import hero from './assets/hero.jpg'`) so Vite
  fingerprints them; never reference a raw path. Large media → the media library.
- **Reach a module (e.g. e-commerce) only over its public API** (`/api/shop/*`,
  and `products` via `useCollectionRecords`) — never `import` module code
  (`@modules/*` is not a kit alias and the module rule forbids it).
- **A rebuild is required** after adding or renaming a kit (the lookup is a
  build-time glob). Editing an existing kit's code is picked up by the dev
  server's HMR.
- **CSP:** React inline `style={}` is fine; do not inject inline `<script>` /
  `<style>` tags. Compiled TSX + co-located CSS is served from your own origin,
  so it just works.

## Styling — kit-wide and per-page CSS

Tailwind + `~/components` cover most of it. When you need hand-written CSS (a
gradient, keyframes, a selector Tailwind can't express), keep **all of a kit's
CSS in a `style/` folder** and just `import` what a file needs:

```
style/
  style.css     the main, kit-wide stylesheet — imported once by index.tsx
  about.css     extra CSS for ONE page — imported by pages/about.tsx only
```

- **Kit-wide:** `style/style.css`, imported once by `index.tsx` (or a shared
  shell) — applies to every page in the kit.
- **Per-page:** `style/<page>.css`, imported by that page (`import
  '../style/about.css'`) — ships only where that page is used. This is the
  "page A has its own extra styles" pattern; the committed reference is
  **`example/style/about.css`** imported by **`example/pages/about.tsx`**
  (served at `/kit-example/about`).

Both load **render-critical**: the public renderer resolves every block/kit
stylesheet from the Vite manifest and links it in the initial `<head>`
(`app/services/public_block_css.ts`), so a page paints styled on the first frame
— no flash of unstyled content.

Two rules:
1. **Prefix your class names** (`.mykit-card`) — a non-isolated kit's CSS is
   global and a bare `.card` can collide. Or set **`"isolate": true`** in
   `kit.json`: the build then scopes every rule to `.kit-<name>` and renames
   `@keyframes`, so bare names are safe (the kit body is auto-wrapped in
   `<div class="kit-<name>">`).
2. **CSP:** a linked stylesheet from your own origin needs no nonce and just
   works. Never inject an inline `<style>`/`<script>` tag; React `style={}` is fine.

## Performance — build a kit that scores well

The reference is **`example/pages/performance.tsx`** (served at
`/kit-example/performance`) — copy its patterns.

**The app already handles the infrastructure**, so you don't:

- assets are brotli/gzip-compressed and immutably cached (`asset_compression_middleware`);
- your kit CSS is linked in the initial `<head>`, so pages paint styled on the
  first frame — no flash (`public_block_css`);
- SSR pages are **hydrated**, not re-rendered, so the server paint is the first paint;
- the page builder / editor never ships in the public bundle.

**A kit only has to get the content-level rules right.** In order of impact:

1. **Never hide above-the-fold content until JS runs.** A scroll-reveal that
   starts the hero at `opacity: 0` and reveals it with JavaScript delays LCP by
   seconds on a throttled phone — the largest element is invisible until the
   bundle loads. Keep above-the-fold content **visible on first paint**; animate
   **below-the-fold** only, or use a CSS entrance animation that plays on load
   (no JS gate). This is the single biggest mobile-score lever.
2. **The LCP image is eager + high priority; everything else is lazy.** On the
   one large hero/above-the-fold image: `fetchPriority="high" loading="eager"
   decoding="async"` + explicit `width`/`height` (reserve space → no layout
   shift). Every image below the fold: `loading="lazy" decoding="async"`. And
   **right-size** photos + prefer **WebP/AVIF** — a 1200px JPEG shrunk into a
   phone is wasted bytes (Lighthouse flags "Improve image delivery").
3. **Load web fonts without blocking render.** A plain
   `<link rel="stylesheet" href="fonts.googleapis.com/...">` blocks the first
   paint on an external round-trip. Render it non-blocking instead — the shell
   flips it in once the DOM is ready:
   ```tsx
   <link
     rel="stylesheet"
     href="https://fonts.googleapis.com/css2?family=…&display=swap"
     media="print"
     data-font-async=""
   />
   ```
   `media="print"` makes it fetch without blocking; `data-font-async` tells the
   shell script to switch it to `all`; `display=swap` covers the brief fallback.
   Even simpler: lean on the app's **appearance font** or a system stack and load
   no web font at all.
4. **Keep the render path light.** Everything a page statically imports ships to
   the browser. Heavy libraries (chart/animation/3D) belong behind a
   `lazy()` + `<Suspense>` boundary so they load only when actually shown, not on
   first paint. Import assets (so they're fingerprinted + compressed); never a
   raw `<img src="/some/path">`.

## Start here

Copy `example/`, rename it, edit `index.tsx`. The full reference — available
libraries, the core UI inventory, design tokens, and CSP details — lives in
[`docs/ai/custom-templates.md`](../../../docs/ai/custom-templates.md).

Kit folders are gitignored (they are operator payloads); `example/` and this
README are the committed exceptions.
