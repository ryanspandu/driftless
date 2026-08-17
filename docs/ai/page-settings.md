# Page Settings & Website Settings (custom code, SEO, meta)

Status: **IMPLEMENTED** (2026-06-24). Per-page settings (General, SEO/Meta, custom
code) live in the builder's **Settings** dialog; site-wide settings (favicon, SEO,
global meta tags, global custom code) live at **`/admin/website-settings`**.

Builds on the Pages builder ([pages-builder.md](./pages-builder.md)) and the custom
builder layout ([builder-layers.md](./builder-layers.md)).

---

## Surfaces (where you edit)

1. **Builder Settings dialog** — gear button in the `BuilderShell` navbar
   ([inertia/puck/settings-dialog.tsx](../../inertia/puck/settings-dialog.tsx)). A
   two-pane modal (left nav + right content). Sections:
   - **General** — title, path, status, render mode (SSR/SSG/CSR), layout / header /
     footer template pickers.
   - **SEO & Meta** — meta title, description, OG image, canonical, no-index, +
     free-form per-page meta tags.
   - **Page code** — per-page custom CSS/JS snippets.
   - **Global code** — site-wide CSS/JS snippets (same data as Website settings).

   The **Templates builder** reuses the same dialog but passes no `pageMeta`, so it
   shows only the two code sections (templates have no title/SEO).

2. **Website settings page** — sidebar **UI → Website settings**
   (`/admin/website-settings`,
   [inertia/pages/admin/website-settings.tsx](../../inertia/pages/admin/website-settings.tsx)).
   Tabs:
   - **Site & SEO** — site title, meta description, favicon (`ImageSettingControl`),
     + **global meta tags** (free-form).
   - **Custom code** — the same site-wide CSS/JS editor (`GlobalCodePanel`).

   This page is distinct from `/admin/settings` ("Settings"), which is now a **hub of links
   only** — every form it used to hold moved to `/admin/settings/appearance` (admin panel
   branding, the sign-in screens, and the built-in-page overrides). The "Site & SEO" tab was
   **moved** from `/admin/settings` to here.

   The boundary to keep: **this page is the public website's identity** (site title, favicon,
   SEO) and **Appearance is the admin shell's** (`admin_branding.project_name`, labelled
   "Admin panel name"). Those two fields used to be labelled "Site title" and "Website name",
   both defaulting to "Driftless" on two different screens with nothing explaining the
   difference — and the second one was wired to nothing at all. If you add a field here, ask
   which of the two audiences it names. The full screen-by-screen map is in
   [settings-ia.md](./settings-ia.md).

---

## Data model & storage (no DB migrations)

| Data | Stored in | Notes |
|------|-----------|-------|
| Per-page **custom code** | `pages.content.root.props.codeSnippets: CodeSnippet[]` | Rides in the Puck doc. Legacy `customCss`/`customJs` strings auto-migrated on read, dropped on first write. |
| Per-page **SEO/meta** | `pages.seo` JSONB | `title`, `description`, `ogImage`, `canonical`, `noindex`, `meta: SiteMetaTag[]`. |
| Per-page **General** | `pages` columns | `title`, `path`, `status`, `render_mode`, `layout_id`, `header_template_id`, `footer_template_id`. |
| **Global code** | `web_settings` section `page_code`, key `snippets` | JSON `CodeSnippet[]` (sanitized server-side). |
| **Global meta tags** | `web_settings` section `site_meta`, key `meta` | JSON `SiteMetaTag[]`. |
| Site title/desc/favicon | `web_settings` section `site_meta` | Pre-existing keys. |

```ts
// inertia/puck/custom-code.ts
export type CodeLang = 'css' | 'js'
export interface CodeSnippet {
  id: string; name: string; lang: CodeLang; code: string; enabled: boolean
}
// app/services/settings_service.ts (mirror on the frontend in api.ts)
export interface SiteMetaTag { name?: string; property?: string; content?: string }
```

`inertia/puck/custom-code.ts` helpers: `readSnippets(rootProps)` (parses
`codeSnippets`, falls back + migrates legacy strings), `cssFromSnippets`,
`jsSnippets`, `newSnippet`.

**How per-page edits persist:** the builder lifts page-level fields into a `PageMeta`
state in [builder.tsx](../../inertia/pages/admin/pages/builder.tsx) (`BuilderInner`),
edited via the dialog, and sent with **Publish** (`useUpdatePage` already accepts
`title/path/status/renderMode/layout+header+footer ids/seo`). Custom-code snippets
write to `root.props.codeSnippets` (so they save with `content`). **Global** code +
meta save immediately via their own APIs (independent of Publish).

---

## Code editor

**CodeMirror 6** — `@uiw/react-codemirror` + `@codemirror/lang-css` +
`@codemirror/lang-javascript` + `@codemirror/theme-one-dark`. Chosen over Monaco:
lightweight, Vite/SSR-friendly, easy to lazy-load.

- [code-editor.tsx](../../inertia/puck/code-editor.tsx) — `lazy()` boundary so the
  editor stays **out of the SSR/public bundle** (same pattern as `rich-text-field`).
- [code-editor-inner.tsx](../../inertia/puck/code-editor-inner.tsx) — the CodeMirror
  instance; language by `'css' | 'js'`, theme follows next-themes `resolvedTheme`.
- [snippet-manager.tsx](../../inertia/puck/snippet-manager.tsx) — **list-first**
  manager (rows: enable toggle · lang badge · name · edit · delete; "Add CSS/JS").
  Editor only opens on Add/select. Reused by Page code (local) and Global code.

---

## Rendering / injection

- **Per-page CSS** — `puckConfig.root.render` ([config.tsx](../../inertia/puck/config.tsx))
  builds one `<style>` from `cssFromSnippets(readSnippets(rootProps))`. Previews live
  in the canvas **and** applies on the public render.
- **Per-page JS** — [public-page-view.tsx](../../inertia/puck/public-page-view.tsx)
  injects one `<script>` per enabled JS snippet. **Public only — never in the editor.**
- **Per-page meta** — `PublicPageView` renders `seo.meta[]` in `<head>`.
- **Global code** — `pages_public_controller.show` loads `getGlobalCode()` →
  `page.globalCode`; `PublicPageView` renders a global `<style>` + global `<script>`s
  (**global before page-local**).
- **Global meta tags** — server-side on builder pages via `page.globalMeta` in
  `PublicPageView` `<head>`; client-side on landing/posts via
  [public-web-meta.tsx](../../inertia/components/public-web-meta.tsx) (reads
  `web.metaTags` from `/api/auth/config`).

> **Scope boundary:** global **meta tags** apply to *all* public pages (builder pages
> + landing/posts). Global **custom code** currently applies to **builder Pages only**
> (it's injected by `PublicPageView`); landing/posts (`layouts/public.tsx`) do **not**
> get global code yet. To extend it, add a client injector like `PublicWebMeta` that
> reads the global snippets from a public config endpoint (or inject in the public
> layout).

**Security:** custom JS is admin-authored arbitrary code; the builder + Website
settings are RBAC-gated. **Global** code/meta has site-wide blast radius — its write
endpoint is gated by `settings:manage`. The in-editor CSS preview is document-wide
(non-iframe canvas), so it can touch editor chrome while editing — harmless on the
public page (no chrome).

---

## Backend

- **`WebSettingsService`** ([settings_service.ts](../../app/services/settings_service.ts)):
  - `getGlobalCode()` / `setGlobalCode()` — `page_code.snippets`, sanitized.
  - `getSiteMetaTags()` + `metaTags` in `mapPublicAppearance()` — `site_meta.meta`.
  - Types `GlobalCodeSnippet`, `SiteMetaTag`.
- **`SettingsController`** ([settings_controller.ts](../../app/controllers/admin/settings_controller.ts)):
  - `getPageCode` / `updatePageCode` (global code; `updatePageCode` busts **all** SSG
    snapshots via `PagesService.invalidateAllSnapshots`).
  - `websiteSettingsPage` (renders `admin/website-settings`).
- **Routes** ([start/routes.ts](../../start/routes.ts)):
  - `GET /api/admin/settings/page-code` (read; admin-area auth) ·
    `PUT /api/admin/settings/page-code` (gated `settings:manage`).
  - `GET /admin/website-settings`.
- **`pages_public_controller.show`** — loads `getGlobalCode()` + `getSiteMetaTags()`
  in parallel → `page.globalCode` / `page.globalMeta`.

---

## Key files

| File | Role |
|------|------|
| `inertia/puck/settings-dialog.tsx` | Builder Settings dialog (General/SEO/Page code/Global code) + `PageMeta` type |
| `inertia/puck/custom-code.ts` | `CodeSnippet` model + helpers + legacy migration |
| `inertia/puck/code-editor.tsx` / `code-editor-inner.tsx` | Lazy CodeMirror editor |
| `inertia/puck/snippet-manager.tsx` | Shared list-first snippet manager |
| `inertia/puck/global-code-panel.tsx` | Global code editor (fetch + draft + Save) |
| `inertia/hooks/api/use-page-code.ts` | `useGlobalCode` / `useUpdateGlobalCode` |
| `inertia/components/admin/meta-tags-editor.tsx` | Shared free-form meta-tag rows (per-page SEO + global) |
| `inertia/pages/admin/website-settings.tsx` | Website settings page (Site & SEO + Custom code) |
| `inertia/components/public-web-meta.tsx` | Site-wide title/favicon/meta on landing/posts |
| `inertia/puck/public-page-view.tsx` | Public render: per-page + global code/meta |
| `app/services/settings_service.ts` | Global code + meta storage/appearance |
| `app/controllers/admin/settings_controller.ts` | `page-code` API + website-settings page |
| `app/controllers/pages_public_controller.ts` | Loads global code/meta for public render |

---

## Design decisions & history

- **CodeMirror over Monaco** — lighter, Vite/SSR-friendly, lazy-loadable.
- **No DB migrations** — per-page code rides in `content`; SEO is additive on the
  `seo` JSONB; global code/meta reuse the existing `web_settings` key/value store
  (sections created lazily).
- **SEO stays in `pages.seo`** (queryable; used by `<head>` + sitemap), threaded
  through Publish — not stashed in `root.props`.
- **Global code editable from two surfaces** sharing one data source: the builder
  Settings dialog "Global code" section **and** the Website settings "Custom code"
  tab.
- **Restructure (post-build):** global code was first a button on `/admin/pages`;
  per the user it moved to a dedicated **Website settings** page under Templates, the
  `/admin/pages` button + `global-code-dialog.tsx` were removed, and the old
  `/admin/settings` "Site & SEO" tab was moved into Website settings. Global **meta
  tags** were added at the same time.

### Follow-ups (not built)

- Global **custom code** on landing/posts (see Scope boundary above).
- Live preview of **global** CSS inside the builder canvas (per-page CSS already
  previews live; global does not).
