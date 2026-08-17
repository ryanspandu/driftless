# Pages — Visual Page Builder (Puck)

**Status:** Complete (2026-06-21) — Fase 0–4 + SSR/SSG refinements all shipped.
**Templates** (headers/footers/components/layouts, live includes, optional per-page layout) — implemented; see [templates.md](templates.md).

> Fase 0: `pages`/`page_revisions` tables + models, `PagesService`, `admin/pages_controller`,
> CRUD routes guarded by `page:*` RBAC, `/admin/pages` list, sidebar entry, `@measured/puck` 0.20.2.
>
> Fase 1: Puck config (`inertia/puck/config.tsx`) — style-ready blocks (Section, Container, Columns,
> Heading, Text, Button, Image, Spacer, Divider) sharing `styleFields` + a `<Box>` wrapper; full-screen
> builder `/admin/pages/:id/edit` (load + save via Puck `onPublish`); public catch-all `GET /*` →
> `pages_public_controller` → standalone `public/page.tsx` rendering Puck `<Render>` (CSR). Verified:
> typecheck green + a seeded page rendered correctly at its public URL, zero console errors.
>
> Fase 2 (collection binding): public read API `GET /api/public/cms/:key/records` (+ `/:id`,
> `public_cms_controller`); builder collections endpoint `GET /api/admin/pages/collections` (page-scoped);
> **CollectionList** block (`inertia/puck/collection-list.tsx`) — a custom field picks a collection &
> maps fields, then a live grid of PUBLISHED records renders in both the editor preview and the public
> page; **RichText** block (`inertia/puck/rich-text.tsx`) — TipTap editor emitting HTML, rendered via
> `dangerouslySetInnerHTML`. Verified end-to-end: a seeded collection rendered as cards on a public page.
>
> Fase 3 (render modes): per-page SSR / SSG / CSR. Inertia SSR is enabled but scoped to the
> `public/page_ssr` component via the `ssr.pages` allowlist in **both** `config/inertia.ts` (runtime)
> **and** `vite.config.ts` (`inertia({ ssr: { enabled: true } })` — required so the SSR bundle is built
> for production: `node ace build` → `build/ssr/ssr.js`). `inertia/ssr.tsx` was rewritten to mirror
> `app.tsx` (same providers + LayoutShell) so hydration is clean. `pages_public_controller` picks the
> component by render mode — CSR → `public/page` (client), SSR/SSG → `public/page_ssr` (server) — and
> sets `Cache-Control` (SSG = `s-maxage` static-like; SSR = `no-store`). SEO `<head>` (title, description,
> og, canonical, robots) is server-rendered for SSR/SSG; `sitemap.xml` now lists published pages; Serwist
> caches public page documents (network-first) for offline. RichText was split into `rich-text-view`
> (SSR-safe) + a lazy `rich-text-field` (TipTap) to keep TipTap out of the SSR path. Verified: SSR raw
> HTML contains the rendered DOM (`<section>`/`<h1>`), CSR does not; clean hydration; build green.
> NOTE: SSG currently = SSR + cache headers; the `rendered_html` column (true render-on-publish HTML
> snapshot) is reserved for a later refinement.
>
> Fase 4 (partial — style depth, media, revisions): style controls extracted to
> `inertia/puck/style-fields.tsx` and deepened — added borderRadius / border / boxShadow (presets) /
> width / minHeight / textSize / fontWeight / lineHeight on top of existing keys (all additive, no
> migration); `builderViewports` (Mobile/Tablet/Desktop) wired into `<Puck viewports>`. Media picker
> `inertia/puck/media-field.tsx` (custom field: pick from `/api/admin/media` or paste a URL) now powers
> the Image block `src`. Page revisions: `PagesService.listRevisions`/`restoreRevision`, routes
> `GET /api/admin/pages/:id/revisions` + `POST /api/admin/pages/:id/revisions/:revisionId/restore`,
> `inertia/hooks/api/use-page-revisions.ts`, `inertia/components/admin/page-revisions-panel.tsx` + a
> History button in the builder (restore → reload). Built via 3 parallel sub-agents; typecheck + build green.
>
> Fase 4 (cont. — templates + global header/footer): **Page templates** — `page_templates` table/model,
> `PageTemplatesService`, `admin/page_templates_controller`, routes `/api/admin/page-templates*`,
> `inertia/hooks/api/use-page-templates.ts`, `page-templates-dialog` + a "Templates" button in the builder
> (save current page as template / apply one → reload). **Global header & footer** — `page_globals`
> table/model (`key` = header/footer), `PageGlobalsService`, `admin/page_globals_controller`, admin editor
> at `/admin/pages/globals` (`inertia/pages/admin/pages/globals.tsx`, header/footer via tabbed Puck),
> routes `/api/admin/page-globals*`; `pages_public_controller` injects header/footer docs and
> `public-page-view` renders header → content → footer (SSR-friendly). Migrations + build (client + SSR) green.
>
> Refinements (done): **SSR data resolution** — `app/services/page_data_resolver.ts` walks the page +
> header + footer Puck docs, pre-fetches each CollectionList's PUBLISHED records, and `pages_public_controller`
> passes them (for SSR/SSG) into `public-page-view`, which provides them via `CollectionDataContext`;
> `collection-list.tsx` reads the context and renders server-side (no client fetch / flash) — keyed
> `${collectionKey}:${limit}`. CSR pages still fetch on the client. **True SSG snapshot** — `inertia.render`
> returns the HTML string on full loads; for SSG, `pages_public_controller` caches it into `pages.rendered_html`
> (via `PagesService.cacheRenderedHtml`, no `updated_at` bump) and serves it raw on later full loads
> (Inertia XHR visits always render live). The snapshot is invalidated on page edit/publish/restore
> (`renderedHtml = null`) and, because snapshots embed hashed asset URLs, is **stamped with the build
> that rendered it** (`pages.rendered_build`, via `currentBuildId()` in `app/services/release.ts`) and
> only served when that stamp matches the running build — a mismatch is a cache miss that re-renders
> itself. Comparing on read rather than purging on boot is what makes it correct under a rolling
> restart, where old workers would otherwise write old-hash snapshots straight back in.
> Public render uses the `renderPage` helper (`inertia.render`
> page-prop inference needs FC exports).

CMS "Pages" feature: build landing / marketing / about pages with a drag & drop
visual builder (Webflow-like, incremental), bound to existing CMS collections,
with a per-page render mode (**SSR / SSG / CSR-PWA**).

A page can instead be written by hand in React (`kind = CODE`), and your own React
components can be registered as builder blocks — see [code-pages.md](code-pages.md).
The builder remains the default, and the recommended path for AI assistants.

## Rendering a builder page from another route

[`app/services/page_renderer.ts`](../../app/services/page_renderer.ts) owns the composition
— layout, header/footer, referenced templates, bound collections, block data, site-wide code
and meta. `PagesPublicController` delegates to it, and so can any route that wants to render
a builder page.

`RenderPageOptions` is what makes a page usable as a **template**:

| Option         | Purpose                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bindings`     | Route params, query and cookies forwarded to the block resolvers, so a block with no explicit target inherits what the URL named                                         |
| `seoOverride`  | The record's own title/description/canonical wins over the template's, field by field — otherwise every record shares one `<title>`                                      |
| `skipSnapshot` | Required for a template. The SSG cache is keyed on the page, so caching one record's output would serve it for every other record. Also forces `Cache-Control: no-store` |

The e-commerce module's `/shop/p/:slug` is the worked example — see
[ecommerce.md](../../modules/ecommerce/README.md#product-pages-one-template-every-product).

## Decisions (locked)

| Aspect             | Decision                                                                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder library    | **Puck** (`@measured/puck`) — MIT, self-hosted, embedded React component                                                                                                                                                                                                |
| Placement          | **Core feature** (`app/` + `inertia/pages/admin/pages/`), not a plugin                                                                                                                                                                                                  |
| Render modes       | Per-page: **SSR**, **SSG** (render-on-publish + cache), **CSR/PWA**                                                                                                                                                                                                     |
| Collection binding | Reuse existing CMS APIs (`external` field + a `CollectionList` block)                                                                                                                                                                                                   |
| Style approach     | Free `className` + global design tokens from Fase 1; **style-ready** architecture from the start. A reusable named-class system (Webflow cascade/combo classes) is **out of scope** — evaluated later; Webstudio is the fallback if it ever becomes a hard requirement. |

### Why Puck (fit with this codebase)

- Plain React component → drops into the Inertia/React admin like the existing
  `inertia/components/cms/schema-builder.tsx` (both use `@dnd-kit`). No iframe / second app.
- `external` field binds blocks to existing collections via the existing
  `/api/admin/cms/:key/records` API — native, no new data infra.
- Output is JSON → stored in a JSONB column, reusing the dynamic-schema + revisions + drafts patterns.
- `<Render>` runs server-side (`react-dom/server`) for SSR/SSG **or** client-side for CSR/PWA →
  per-page render toggle without flipping app-wide Inertia SSR.
- Puck props are arbitrary JSON → **adding style controls later needs no migration**; old pages keep working.

## Architecture

```
ADMIN (CSR, Inertia)                         PUBLIC (3 modes, 1 renderer)
┌─────────────────────────┐                  ┌──────────────────────────────┐
│ /admin/pages  (list)     │   save JSON      │ GET /*  → PagesPublicController│
│ /admin/pages/:id/edit    │ ───────────────► │   lookup Page by path          │
│   <Puck config={...} />   │  pages.content   │   render by render_mode:       │
│   blocks + style + bind   │     (JSONB)      │   ├─ SSR  → Inertia ssr.pages  │
└─────────────────────────┘                  │   ├─ SSG  → cached HTML         │
        ▲ fetchList()                          │   └─ CSR  → client + Serwist    │
        │ /api/admin/cms/:key/records          │   all via inertia/pages/       │
        └─ bind to collection (existing API)   │   public/page.tsx (<Render/>)  │
                                               └──────────────────────────────┘
```

Key: **one** public renderer component (`public/page.tsx` calling Puck `<Render config data/>`).
The three modes differ only in the render path, not in implementation.

## Data model

`pages` table (follows CMS conventions: ULID, soft-delete, revisions):

| Column                                     | Type               | Notes                                           |
| ------------------------------------------ | ------------------ | ----------------------------------------------- |
| `id`                                       | ULID               | consistent with CMS records                     |
| `title`                                    | text               |                                                 |
| `path`                                     | text, unique index | slug; supports nested (`/about/team`)           |
| `status`                                   | enum               | `DRAFT` / `PUBLISHED`                           |
| `render_mode`                              | enum               | `SSR` / `SSG` / `CSR` — per-page toggle         |
| `content`                                  | jsonb              | Puck block tree                                 |
| `rendered_html`                            | text, nullable     | SSG cache                                       |
| `seo`                                      | jsonb              | title, description, ogImage, canonical, noindex |
| `published_at` / timestamps / `deleted_at` |                    | soft delete                                     |
| `author_id`                                | FK users           |                                                 |

Plus `page_revisions` (mirror `cms_revisions`).

## Backend

- **Migration** `create_pages_table` + `create_page_revisions_table`
- **Model** `app/models/page.ts` (Lucid)
- **Service** `app/services/pages_service.ts` — CRUD, publish, slug, revisions, `resolveData`
- **Validators** (VineJS) — create / update / publish
- **Controllers** — `admin/pages_controller.ts` (Inertia pages + API CRUD/publish),
  `pages_public_controller.ts` — `show` (catch-all, PUBLISHED-only by path) + `preview`
  (admin `GET /admin/pages/:id/preview`, renders ANY status incl. Draft, uncached). Both
  share the private `composeAndRender` (layout/header/footer + templates + collections +
  global code/meta).
- **Routes** — admin guarded with `middleware.permission(...)`; public catch-all `GET /*`
  registered **last** (after `/`, `/posts/:slug`, `/admin/*`, `/api/*`, `/login`, `/offline`) + reserved-slug denylist.
  The preview route lives in the authed `/admin/*` group (next to `/admin/pages/:id/edit`).
- **Permissions** — mint `pages.view/create/update/delete/publish` in RBAC

## Frontend

- `inertia/pages/admin/pages/index.tsx` — list using the shared `DataTable` (`~/components/data-table`);
  a **View** column opens the live page (`/{path}`) when published, else the **Preview** route (Draft)
- The builder topbar has a **Preview** button → opens `/admin/pages/:id/preview` in a new tab (works at
  any status, including Draft)
- `inertia/pages/admin/pages/builder.tsx` — `<Puck>` + `BuilderShell` custom layout, Publish, page
  preview; lifts page-level fields into `PageMeta` state saved on Publish
- `inertia/puck/builder-shell.tsx` — custom Puck layout: toolbar (undo/redo/Publish), device-size
  switcher, panel toggles, **Settings gear**, Layers tree. See [builder-layers.md](./builder-layers.md)
- `inertia/puck/settings-dialog.tsx` — **Page Settings** dialog (General · SEO/Meta · Page code ·
  Global code). Custom CSS/JS (CodeMirror), per-page SEO, site-wide code/meta. See
  [page-settings.md](./page-settings.md)
- `inertia/puck/config.tsx` — block registry, grouped into Webflow-style **categories**
  (`Config.categories`): **Structure** (Section, Container, Quick Stack, V Flex, H Flex, Page Slot) ·
  **Basic** (Div Block, List, List Item, Link Block, Button) · **Typography** (Heading, Paragraph,
  Text Link, Text Block, Block Quote, Rich Text) · **CMS** (Collection List) · **Media** (Image,
  Video, YouTube, Lottie, Spline, Rive) · **Forms** (Form Block, Label, Input, File Upload, Text
  Area, Checkbox, Radio Button, Select, reCAPTCHA\*, Form Button, **Login Form, Sign-up Form,
  Forgot Password Form, Reset Password Form**) · **Advanced** (Search, Background
  Video, Dropdown, Code Embed, Lightbox, Navbar, Slider, Tabs, Map, Facebook, X, Custom Element, Code
  Block) · **Other** (Grid, Columns, Spacer, Divider, Template Reference). `Box` forwards extra DOM
  attrs (e.g. `href`) so blocks render as real `<a>`/`<li>`/`<input>`/etc.
  \*The four auth blocks submit for real, and `FormBlock`'s **Submits to** field wires a
  hand-assembled form to the same endpoints — see [auth-pages.md](./auth-pages.md). The
  remaining native form elements are still render-only (there is no generic form-submission
  backend), and reCAPTCHA is a placeholder. Webflow's "Locales List" is skipped (no i18n
  locales).
- `inertia/puck/media-embeds.tsx` (+ `media-rive-inner.tsx`) — **lazy, client-only** players for
  Lottie (`@lottiefiles/dotlottie-react`), Spline (`@splinetool/react-spline`), Rive
  (`@rive-app/react-canvas`); mount-guarded so the heavy runtimes stay out of the main + SSR bundles
- `inertia/puck/blocks-interactive.tsx` — interactive Advanced blocks (Dropdown, Lightbox, Navbar,
  Slider, Tabs) as real hook components (render delegates `(props) => <View {...props} />`); render
  their initial state on SSR, interactive after hydration
- `inertia/puck/style-fields.ts` — shared style fields + `<Box>` wrapper (see below)
- `inertia/pages/public/page.tsx` — public renderer (`<Render/>`), added to SSR allowlist
- Reuse: Media picker, TipTap, collection API hooks, Tailwind tokens

## Render pipeline

- **SSR** — `config/inertia.ts`: `ssr.enabled: true` + `pages: (p) => p === 'public/page'`.
  Admin stays CSR; only the public renderer is server-rendered. Reuses `inertia/ssr.tsx` + Vite SSR build.
- **SSG** — on publish (or first hit), render once → store in `rendered_html` → serve cache afterwards.
- **CSR/PWA** — not in SSR allowlist → client render → Serwist offline cache.
- **Collection binding** — Puck `resolveData`: server-side resolve for SSR (fresh data),
  client-side fetch for CSR via `/api/public/...`. `CollectionList` loops records by filter/sort/limit
  over a template block (Webflow Collection List).

## Style system (Webflow-like, incremental)

Puck has **no built-in universal style panel** — style controls are component fields we define.
To make later enrichment a 1-place change, every block wraps in a shared `<Box>` and spreads a
shared `styleFields`:

```tsx
// inertia/puck/style-fields.ts — define ONCE, used by all blocks
export const styleFields = {
  padding: { type: 'text', label: 'Padding' }, // "16px" or "py-8"
  margin: { type: 'text', label: 'Margin' },
  font: { type: 'select', options: themeFonts }, // global token
  className: { type: 'text', label: 'Custom class' }, // free Tailwind/CSS
}

const Box = ({ s, children }) => (
  <div className={s.className} style={{ padding: s.padding, margin: s.margin, fontFamily: s.font }}>
    {children}
  </div>
)

const Heading = {
  fields: { text: { type: 'text' }, ...styleFields }, // spread → all controls
  render: ({ text, ...s }) => (
    <Box s={s}>
      <h2>{text}</h2>
    </Box>
  ),
}
```

Adding `borderRadius`/`boxShadow` later = one line in `styleFields`. No migration (props are JSON).
Global design tokens (fonts/colors/spacing) live on the Puck `root`. Responsive preview via Puck
**viewports**. Per-breakpoint overrides and a unified "Style" tab (`fieldTypes` override) come in Fase 4.

## Roadmap

- **Fase 0 — Foundation**: install Puck (verify React 19 compat), `pages`/`page_revisions`
  model + migration, service, validator, admin list page (DataTable), CRUD API, routes + RBAC permissions.
- **Fase 1 — Builder MVP + style-ready**: Puck config (structure blocks + Text/RichText via TipTap +
  Image via Media) **plus** `styleFields`/`<Box>`/tokens/viewports, builder page (load/save/draft/preview),
  public CSR render via catch-all `GET /*`.
- **Fase 2 — Collection binding**: `external` field → `/api/admin/cms/:key/records`, `CollectionList` +
  single-record binding, `/api/public/collections/:key`, `resolveData`.
- **Fase 3 — Render modes**: per-page SSR/SSG/CSR toggle, Inertia `ssr.pages` allowlist, SSG cache,
  Serwist offline for CSR/PWA, SEO meta + sitemap.
- **Fase 4 — Style depth**: per-breakpoint overrides, more properties, unified Style tab,
  reusable sections/templates, global header/footer, revisions/restore UI.
- **Layers + Detail panel** (Webflow-style right sidebar, custom `BuilderShell` layout). DONE —
  see [builder-layers.md](./builder-layers.md).
- **Page Settings + Website settings** (custom CSS/JS via CodeMirror, per-page SEO/General,
  site-wide code + meta tags at `/admin/website-settings`). DONE — see
  [page-settings.md](./page-settings.md).

## Open items / risks

- Verify `@measured/puck` ↔ React 19 compatibility on install.
- Catch-all route ordering vs `/assets`, `/api`, `/admin`; maintain a reserved-slug denylist.
- Block components must be SSR-safe (no browser-only APIs during render).
- SSG cache invalidation when a bound collection changes (Fase 3).
- Reusable named-class system is explicitly **not** in scope — re-evaluate (Webstudio) only if required.
