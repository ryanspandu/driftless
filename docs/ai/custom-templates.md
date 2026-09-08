# Custom templates — coded page "kits"

**Status:** implemented.

A **custom template** (internally a **kit**) is a fully hand-coded page delivered as one
self-contained folder under `inertia/custom/kits/<name>/` — the WordPress-theme counterpart to
a single-file [code page](code-pages.md). It is a code page (`kind = CODE`) whose `component`
points at a folder (`component = "kit:<folder>"`) instead of a single `.tsx` file, so it keeps
everything a page row owns — path, Draft/Published state, SEO, preview, header/footer
selection — while the whole markup, styling and sub-components live in its own folder.

Kits are **operator payloads**: the folders are gitignored (they live only on a customer's
server), and a future Driftless template marketplace installs them. `example/` and the folder
README are the committed exceptions.

## Which to use

| Situation | Use |
|---|---|
| Marketing/landing/content pages; anything a non-developer edits | **Page builder** |
| One custom piece on an otherwise editable page | **Custom block** |
| A single bespoke coded page, one file | **[Code page](code-pages.md)** |
| A themed, self-contained coded page with its own components/styles/assets | **Custom template (kit)** |
| Coded structure, but one area an editor must change | **kit + `<BuilderRegion />`** |

> **Rule for AI assistants:** build pages with the **page builder** by default. Before creating
> a page, ask the operator whether they want a page-builder page or a custom template. Only
> create a kit (or point a page at one) when they ask for it. Over MCP: call
> `list_custom_templates`, then `create_page` with `kind:"CODE"`, `component:"kit:<id>"`.

## The folder contract

```
inertia/custom/kits/<name>/
  kit.json          required — marks the folder as a kit + names it for the picker
  index.tsx         required — default export: (props: CodePageProps) => JSX
  components/…       optional — sub-components, imported with relative paths
  styles.css        optional — co-located CSS, imported by index.tsx
  assets/…           optional — images/fonts, IMPORTED (never referenced by raw path)
```

- **Folder name is the id.** A page selects the kit by storing `component = "kit:<folder>"`.
  The public URL comes from the page record, not the folder.
- **`kit.json`** = `{ "name": "...", "description": "..." }`. Its presence marks the folder as a
  kit; `name`/`description` show in the create-page picker. It is parsed by a plain Node script,
  so it must be valid JSON (no TS).
- **`index.tsx`** default-exports a component typed `CodePageProps` — identical to a single-file
  code page's contract. `inertia/custom/kits/example/` is a working reference: copy it, rename
  the folder, edit `index.tsx`.

```tsx
// inertia/custom/kits/brochure/index.tsx
import { SiteChrome } from '~/custom/site-chrome'
import type { CodePageProps } from '~/custom/types'
import { Hero } from './components/hero'
import './styles.css'

export default function Brochure({ title, header, footer }: CodePageProps) {
  return (
    <SiteChrome header={header} footer={footer}>
      <Hero title={title} />
    </SiteChrome>
  )
}
```

### Props — `CodePageProps`

From `inertia/custom/types.ts`: `title`, `path`, `seo`, `globalMeta`, `header`, `footer`,
`bindings`, `preview`. A kit owns its markup and does **not** receive the Puck config, block
registry, or data resolvers. The `<head>` (title, description, `og:`, canonical, robots, site
meta) is emitted for you from the page's SEO fields.

`<SiteChrome header={header} footer={footer}>` is **opt-in**: wrap your markup in it to sit
inside the real site header/footer (the templates from `/admin/templates`, so header edits
reach your kit without touching it); drop it to own the whole viewport.

### Editable region (optional)

Add `export const editableRegion = true` and render `<BuilderRegion />` to leave one area
editable in the page builder — you own the structure, an editor owns the middle. The region's
content is the page's own `content` column, resolved exactly as for a builder page. One region
per kit; the flag is required (the admin cannot infer it, and shows the "built in code" notice
without it).

## File-pages — a folder of routes, no database rows

A kit's `index.tsx` is *one* template a database page points at. A kit can instead (or also)
hold a **`pages/` folder**, where each `.tsx` file is a standalone route that lives in code with
**no database row** — you add or edit pages by editing files, not by creating rows and picking a
template.

```
inertia/custom/kits/mysite/
  kit.json
  pages/
    index.tsx     → /            (filename is the path; `index` → home)
    about.tsx     → /about
    contact.tsx   → /contact
  components/       (shared across the pages)
```

- **The filename is the URL path** (root-level); override it with `export const path = 'company/about'`.
- **Title** defaults to the titleized filename (`about` → “About”, `index` → “Home”); override
  with `export const title = 'About us'`. There is no DB row, so title/SEO come from the file.
- Each file default-exports a `CodePageProps` component, exactly like a single-file kit — wrap in
  `<SiteChrome>`, import shared `../components/*`, use app libraries + Tailwind.
- **A database page always wins** on a path clash — file-pages fill only the paths no DB page owns.
- File-pages are **pure code: no editable region** (a region needs a DB row to store its content).
- They appear in the admin pages list as **read-only rows** (a *File page* badge, only *View* —
  no builder, settings or delete; edit the file instead). The home path (`/`) is served by the
  landing route, so an `index.tsx` file-page needs a non-home `path` for now.

Component pointer (internal): a file-page renders via `kitpage:<kit>/<file>`; a page a DB row
points at uses `kit:<id>`.

## Code chrome — header / footer / layout as code

A kit can supply **chrome templates** — `templates/{header,footer,layout}.tsx` — that a page
points its header, footer or layout at **per-page**, exactly like a builder template but written
in React:

```
inertia/custom/kits/<name>/
  templates/
    header.tsx    default-exports a component (renders itself; no props)
    footer.tsx
    layout.tsx    receives the page content as `children`
```

- Pick one in the page's **Header / Footer / Layout** picker — kit chrome shows as
  `<kit> · code`. A set code chrome **wins over** a builder template for that slot, and mixes
  freely (e.g. a code header with a builder footer).
- Works for builder pages **and** code pages (a code page's `<SiteChrome>` picks up a code
  header/footer automatically). Layout applies to builder pages.
- Stored in the page's `code_header` / `code_footer` / `code_layout` columns as the pointer
  `codetpl:<kit>/<type>` (separate from the builder-template FK columns).

## Collection templates — render CMS records as code

A **Collection List** block normally repeats a built-in item card or a Puck *collection template*.
A kit can instead supply a **code** item design — `collection/<collectionKey>.tsx` — and the list
renders every record through it:

```
inertia/custom/kits/<name>/
  collection/
    posts.tsx       binds to the built-in Posts collection
    products.tsx    binds to Products (store on)
    <yourkey>.tsx   binds to a CMS collection by its key
```

- **The filename is the collection key.** `collection/posts.tsx` only offers itself on a
  Collection List bound to `posts`; a `blog` collection needs `collection/blog.tsx`.
- On the Collection List, set **Item design → Code template**, then pick the kit component in the
  right panel (it shows as `<kit> · code`; only components whose filename matches the bound
  collection appear).
- The component default-exports `({ record }) => JSX`. It receives **one whole record**:
  `record.data` holds the collection's fields, with `record.id`, `record.status`,
  `record.createdAt`, `record.updatedAt` alongside. Read only what you need — an absent field is
  just `undefined`. Type the prop with `CustomCollectionRecord` from `~/custom/registry`.
- Stored on the block as the prop `codeTemplate = "codetpl:<kit>/collection/<key>"`. The list
  handles fetching, paging, sort and filter (server-side) — the component only draws one record.
- See `inertia/custom/kits/example/collection/posts.tsx` for a runnable post-card reference.

## Reading collection data — fetch CMS records at runtime

A *collection template* (above) renders **one** record inside a builder-driven Collection List.
When kit-owned markup needs to **fetch records itself** — a "latest posts" strip, a product grid, a
custom listing — use the `useCollectionRecords` hook from `~/hooks/cms/use-collection-records`.

```tsx
import { useCollectionRecords } from '~/hooks/cms/use-collection-records'

export default function LatestPosts() {
  const { data, isLoading, isError } = useCollectionRecords('posts', { limit: 6 })
  if (isLoading) return <p>Loading…</p>
  if (isError) return <p>Could not load posts.</p>
  return <ul>{data?.items.map((r) => <li key={r.id}>{String(r.data.title)}</li>)}</ul>
}
```

- It calls the public read API `GET /api/public/cms/:key/records` — **any** collection (`posts`,
  `products`, or your own CMS collections), **published records only**. Relation fields come back as
  display strings and media fields as public URLs.
- **Options** (bold = the ones you'll reach for): `limit` — page size 1–100 (**note: `limit`, not
  `pageSize`**; default 12); `page`; `sortField` (a field key, or `created_at`/`updated_at`) +
  `sortDir`; `filterField`+`filterValue` (**both or neither**); `search`; `enabled`; `staleTime`.
  Returns a react-query result whose `data` is `{ items, total, page, pageSize, totalPages }`.
- **One record:** `useCollectionRecord(key, id)` returns a single `CmsRecord`; pair it with
  `CodePageProps.bindings` for a detail file-page. Import the `CmsRecord` type from the same module.
- Each record is `{ id, status, data, createdAt, updatedAt }` — the collection's fields live under
  `data` (a `Record<string, unknown>`; narrow before use).

> **SSR:** the hook fetches on the client, so the first server paint is empty and the data arrives
> after hydration. That's fine for dynamic/interactive sections; for **SEO-critical, above-the-fold**
> lists use the builder's Collection List block instead (it has the SSR preload).

> There is **no public endpoint that lists collection keys** — you pass the key you want. See
> `inertia/custom/kits/example/pages/collection-demo.tsx` for a runnable reference.

## Email templates — a transactional email as code

A kit can supply **code EMAIL templates** — `emails/<name>.tsx` — the coded twin of a
Puck-designed email (Templates → Emails). Wire one to a mail event under **Settings → Email →
Notifications → Design**; it renders that notification instead of the built-in layout.

```
inertia/custom/kits/<name>/
  emails/
    password_reset.tsx    → codetpl:<kit>/email/password_reset
    order_confirmation.tsx
```

- The component default-exports `(vars: EmailVars) => JSX`. Import the email-safe primitives from
  `~/custom/email_kit`: `EmailRoot` (the shell — wrap everything in one), `EmailHeading`,
  `EmailText`, `EmailButton`, `EmailDivider`, `EmailSpacer`, and **`EmailBody`** (the slot the
  service fills — see below). You may also hand-write inline-styled JSX.
- **Variables** are `{{placeholders}}`: read `vars.siteName` / `vars.name` etc. and each renders
  as `{{siteName}}`, filled in at send. Only the wired **event's** declared variables get a value
  (Notifications lists them per event); any other token is left visible in the inbox.
- **`<EmailBody/>`** marks where the service drops what the email exists to carry — the reset
  link, the order table, the tracking number. Place exactly one where a notification needs it;
  omitting it silently drops that content. You place it but never author it.
- **Rendered at build time, not at send.** The queue worker has no React bundle, so the generator
  flattens each `emails/*.tsx` to inline-styled HTML (`renderToStaticMarkup`) into
  `app/services/custom_email_templates.generated.ts`; the send path only string-substitutes it —
  identical to how a Puck email is flattened in the operator's browser at publish. **Adding or
  editing an email needs a rebuild** (the pre-render is a build step).
- **Email rules apply** (clients strip `<style>`, ignore flex/grid, block remote assets): inline
  styles only, **literal hex colours** (no Tailwind, no CSS variables, no `oklch()`), tables not
  flex/grid. The `email_kit` primitives already obey these.
- Stored on the event as `mail_event_settings.code_template` (separate from the `template_id` FK,
  since a pointer has no `templates` row); mutually exclusive with a DB template.
- **Reach (v1):** a code email renders wherever the designed-template seam is honored — today the
  **Password reset** email. The e-commerce order emails render their own layouts and would need a
  seam retrofit first (a follow-up). See `inertia/custom/kits/example/emails/password_reset.tsx`.

## Using the e-commerce module — cart, checkout, products

A kit can build a full storefront experience, but **only through the store's public HTTP surface**
— never by importing the module.

| Situation | Use |
|---|---|
| Product cards / a catalogue grid | `useCollectionRecords('products')` (the `products` built-in collection) |
| Cart, checkout, account, live pricing | `fetch('/api/shop/*')` |

- **Never import the module.** `@modules/*` is a Vite-only alias — it is **not** in the kit's
  TypeScript paths, so importing `modules/ecommerce/…` fails `tsc`; and the module rule
  ([modules.md](./modules.md)) forbids core/kits importing module code regardless. So `MoneyInput`
  and anything under `modules/ecommerce/ui/admin/*` are **off-limits** on a public page too (they
  call authed admin endpoints — a 401 would bounce your shopper into `/login`).
- **Products as a collection.** `useCollectionRecords('products')` returns product records
  (`data`: title, subtitle, slug, `url` = `/shop/p/<slug>`, price(formatted), priceAmount, currency,
  image, imageAlt, type, featured). Base-currency, active-only, and it simply vanishes when the
  store is off — the most decoupled way to list products.
- **Interactive commerce via `/api/shop/*`.** The full endpoint list (catalogue, cart, checkout,
  account) is the storefront table in
  [modules/ecommerce/README.md](../../modules/ecommerce/README.md#storefront). The non-negotiables:
  - Use **plain `fetch`**, not the admin `apiFetch` (a storefront 401 must not redirect a shopper to
    `/login`); send `credentials: 'same-origin'` and echo the `XSRF-TOKEN` cookie as `X-XSRF-TOKEN`;
    put an `Idempotency-Key` on `POST /api/shop/checkout`.
  - The **cart is server-side** (cookie `dl_cart`); the **client never sends a price** — the server
    prices the basket. `POST /checkout` returns a **`redirectUrl`** to a hosted gateway page (a real
    order is created there); the browser never marks an order paid. These are the store's
    [five rules](../../modules/ecommerce/README.md#the-five-rules).
  - **`/shop/*` is a reserved path** — a kit page cannot live there; put your storefront under your
    own route (e.g. `/kit-example/shop-demo`) and drive views with client state.
- **Detecting the store.** There is no public "is enabled" flag — a call to `/api/shop/*` returns
  **404** when the module is off. Branch on it and show a graceful "store unavailable" state.
- The worked example is `inertia/custom/kits/example/pages/shop-demo.tsx` (catalogue → product
  detail → add-to-cart → cart → checkout redirect), with a copy-paste client at
  `inertia/custom/kits/example/components/shop_api.ts`.

## What you can build with

### Available libraries (root `package.json` only)

Import anything already in the app — there is **no per-folder `npm install`**. Notable
libraries a kit can use directly:

- **React 19** (hooks, Suspense) and **Tailwind v4** (+ `tw-animate-css` utilities).
- **@tanstack/react-query** and **@tanstack/react-table** (data + tables).
- **recharts** (charts), **@measured/puck** is core-only — do not import it.
- **@tiptap/** (rich text), **@dnd-kit/** (drag & drop).
- Icons: **@phosphor-icons/react**, **lucide-react**, **react-icons**.
- **@base-ui/react** primitives, **sonner** (toasts), **clsx** / **tailwind-merge** /
  **class-variance-authority** (the `cn()` helper is `~/lib/utils`).
- **luxon** (dates), **zod** (validation), **qrcode.react**, **react-day-picker**.
- Animation/3D: **@lottiefiles/dotlottie-react**, **@rive-app/react-canvas**,
  **@splinetool/react-spline**.

If you need something not listed, check `package.json` first; if it is not there, it is not
available to a kit.

### Core UI components — `~/components/ui/*`

Reuse the app's design-system components instead of rebuilding them:

`app-select`, `app-async-select`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`,
`card`, `chart`, `checkbox`, `collapsible`, `combobox-input`, `date-picker`, `dialog`,
`dropdown_menu`, `input`, `label`, `popover`, `scroll-area`, `separator`, `sheet`, `skeleton`,
`switch`, `table`, `tabs`, `textarea`, `tooltip`.

Helpers live under `~/lib` — most usefully `~/lib/utils` (`cn()` for class merging).

### Design tokens

Style with the theme tokens so a kit follows the operator's appearance settings: Tailwind
classes like `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`,
`text-primary-foreground`, `border-border`, `bg-card`, `rounded-[var(--radius)]`. The full set
is defined in `inertia/css/app.css`. The public shell applies the light theme; do not hard-code
hex values you could take from a token.

### CSS and assets

- **Tailwind utilities** in a kit's TSX are scanned automatically — the build generates an
  `@source` line per kit (installed kits are gitignored, and Tailwind would otherwise skip
  their classes). Nothing to configure.
- **Co-located CSS** (`import './styles.css'`) is emitted as a self-origin stylesheet — fine
  under the CSP. Reach for it only for what Tailwind cannot express.
- **Assets must be imported** (`import hero from './assets/hero.jpg'`) so Vite fingerprints them
  into `/assets`. Never reference a raw path — it would need a static route and breaks SSG's
  hashed-URL snapshots. Large media belongs in the media library.

### CSP — do's and don'ts

Production runs a strict nonce-based Content-Security-Policy (`config/shield.ts`):

- ✅ React inline `style={{ … }}` attributes — allowed.
- ✅ Compiled TSX and co-located CSS — served from your own origin, so they just work.
- ❌ Injecting inline `<script>` / `<style>` **elements** without the per-request nonce (you
  cannot bake it into a file).
- ❌ Loading scripts/styles/fonts from arbitrary external origins — blocked except a small
  allowlist. Bundle what you need instead.

Because a kit is compiled into the app bundle (not injected as raw strings), it sidesteps the
CSP entirely — which is exactly why kits are built this way.

## Selecting and rendering a kit

1. **Author** the folder under `inertia/custom/kits/`.
2. **Rebuild** the front end (see below).
3. **Create a page** at `/admin/pages` → *Built with* → **Custom template (coded)** → pick the
   kit. Or over MCP: `list_custom_templates` then `create_page` with `kind:"CODE"`,
   `component:"kit:<id>"`.

Rendering reuses the code-page pipeline unchanged: `PageRenderer` dispatches a `kind = CODE`
page to `public/code_ssr` (SSR/SSG) or `public/code` (CSR); `CodePageView` resolves the
`kit:<id>` pointer to the folder's `index.tsx` via the glob in `inertia/custom/registry.ts`.

## Adding or renaming a kit requires a rebuild

Discovery is `import.meta.glob` (Vite expands it **at build time**) plus a generated manifest.
A kit added after the build is invisible until the front end is rebuilt — the same constraint
code pages and modules have. In dev the pre-hooks regenerate the manifest and Vite reloads;
in production it is a deploy. *Editing* an existing kit's code is picked up by HMR.

`scripts/generate-custom-templates.mjs` writes two committed artifacts on
prebuild/predev/preserve/pretest: `app/services/custom_templates.generated.ts` (the manifest
`PagesService` validates `kit:<id>` against, and the admin/MCP pickers read) and
`inertia/css/custom-templates.generated.css` (one Tailwind `@source` line per kit).

## Permissions & the future marketplace

Writing a CODE page (kit or single-file) or content with code snippets requires the
`settings:manage`-backed code ability — enforced on both the admin route and the MCP
builder-API (`store`/`update`). A `builder:pages` token alone cannot point a page at code.

Kits render **in-process with full app privilege**, which is correct for operator-authored
templates. A third-party marketplace will need isolation (an iframe-wrapped renderer) and
signature verification before install; the `kit.json` marker + generated manifest + wrapper
page leave room to add both without reworking this design.

## Files

| Path | Role |
|---|---|
| `inertia/custom/kits/<name>/` | A custom template (kit): `kit.json` + `index.tsx` + optional components/styles/assets |
| `inertia/custom/kits/<name>/pages/` | File-pages — one `.tsx` per route, no DB row (`kitpage:<kit>/<file>`) |
| `inertia/custom/kits/<name>/templates/` | Code chrome — `header/footer/layout.tsx` (`codetpl:<kit>/<type>`) |
| `inertia/custom/kits/<name>/collection/` | Collection templates — `<key>.tsx` per collection (`codetpl:<kit>/collection/<key>`) |
| `inertia/custom/kits/<name>/emails/` | Code EMAIL templates — `<name>.tsx` per email (`codetpl:<kit>/email/<name>`) |
| `inertia/custom/email_kit.tsx` | Email-safe primitives (`EmailRoot`, `EmailBody`, …) for `emails/*.tsx` |
| `app/services/custom_email_templates.generated.ts` | Generated: each email flattened to send-ready HTML (do not edit) |
| `inertia/hooks/cms/use-collection-records.ts` | Kit-facing hooks — read published collection records / one record |
| `inertia/custom/kits/example/components/shop_api.ts` | Copy-paste decoupled client for the `/api/shop/*` storefront API |
| `inertia/custom/kits/example/pages/collection-demo.tsx` | Runnable `useCollectionRecords` demo |
| `inertia/custom/kits/example/pages/shop-demo.tsx` | Runnable full storefront demo (catalogue → checkout) |
| `inertia/custom/kits/example/` | Committed reference kit — copy it |
| `inertia/custom/kits/README.md` | The quick-start that lives where kits live |
| `inertia/custom/registry.ts` | Resolves `kit:<id>` / `kitpage:` / `codetpl:` pointers → kit components |
| `inertia/custom/code-page-view.tsx` | Renders the resolved component (shared with code pages) |
| `inertia/custom/types.ts` | `CodePageProps` |
| `app/services/custom_templates.generated.ts` | Generated manifest (do not edit) |
| `inertia/css/custom-templates.generated.css` | Generated Tailwind `@source` lines (do not edit) |
| `scripts/generate-custom-templates.mjs` | Writes both generated files |

## Related

- [code-pages.md](./code-pages.md) · [pages-builder.md](./pages-builder.md) · [mail.md](./mail.md) · [modules.md](./modules.md) · [e-commerce](../../modules/ecommerce/README.md)
