# Changelog — SEO, favicon, offline-sync & theme-scoping batch (`develop`)

A summary of the fixes/features shipped this session, with pointers to the full docs.
Commits: `5fac128`, `9ca9025`, `4d807b5`, `d930eb9`, `e644439`, `ab320c3`, `f624e72`, `10e7f10`,
`3f19799`.

## 1. Canonical URL fixed on role-slot pages + built-in pages SSR'd — `5fac128`

- **Root cause:** `page_renderer.ts`'s canonical fallback (used when no
  `seoOverride.canonicalPath` is passed) resolved to `absoluteUrl(page.path)` — the
  underlying Page row's own stored `path` column, not the URL actually being served.
  For a **role-slot override** (one Page rendered at a fixed built-in route — home,
  `/blog`, `/shop`, cart, checkout, an auth screen, …) that's an arbitrary internal
  slug, so `/` shipped `canonical = ".../home"` (the seeded front page's own `path`).
  Fixed to fall back to the request's own URL instead — safe for an ordinary page too,
  since its `path` column *is* the URL it's served at.
- The same bug independently corrupted `structured_data_service.ts`'s JSON-LD
  (`WebPage.url`, `BreadcrumbList`) — fixed the same way.
- The built-in fallback views (`home`, `posts/index`, `posts/category`, `posts/tag`,
  `posts/show` — what renders when no override page is assigned to a role slot) were
  CSR-only, so they shipped **no** canonical at all to a crawler that doesn't execute
  JS. Added to `config/inertia.ts`'s `ssr.pages` allowlist, each given a
  server-computed `canonicalUrl` prop.
- Docs: [pages-builder.md](./pages-builder.md#canonical-url--the-default-when-seooverride-isnt-passed).

## 2. Favicon applied globally, server-side — `9ca9025`

- The favicon was set only by a client-only `useEffect` (`public-web-meta.tsx`) that
  ran on landing/posts alone — never on builder/CODE pages, never on admin. Moved to
  `InertiaMiddleware.share()`, which shares `faviconUrl` to the root edge view on
  **every** request (`ctx.view.share`, mirroring how Shield already shares `cspNonce`)
  — `<link rel="icon">` is now correct in the initial HTML everywhere, admin included.
- Docs: [page-settings.md](./page-settings.md#rendering--injection).

## 3. `postDetail` page-role slot for `/posts/:slug` — `4d807b5`

- New role slot (alongside `postsArchive`/`categoryArchive`/`tagArchive`): an operator
  can assign a builder or CODE/kit page to replace the built-in single-post view via
  **Use as page → Post detail**. A CODE/kit override gets the resolved, already-gated
  post (`{ post, locked }`) as `props.record`, SSR'd per slug, with its own
  canonical/title — a builder page there shows the same content for every post (no
  per-post builder block exists yet). `postsArchive` (`/blog`) itself, built in a
  prior session, had never been documented either — both are covered together now.
- Docs: [content-taxonomy-and-visibility.md](./content-taxonomy-and-visibility.md#4-blog-index--post-detail-overrides-use-as-page).

## 4. Uploaded favicon/logo/collection-icon transparency preserved — `d930eb9`, `e644439`

- `ImageSettingControl`'s in-browser resize (`imageFileToResizedDataUrl`) always
  re-encoded the result as JPEG, which has no alpha channel — a transparent
  PNG/WebP/SVG source got its transparent pixels flattened onto an opaque black
  backdrop before encoding. Now outputs PNG whenever the source isn't already JPEG.
- Docs: [page-settings.md](./page-settings.md#rendering--injection).

## 5. Offline sync: pull now reconciles server-side deletions — `ab320c3`

- `putServerRows` (the pull-sync half of the offline store) only ever upserted the
  rows the server returned — a record deleted server-side stayed cached locally
  forever, still showing "Published" with a green synced checkmark (that checkmark
  only ever reads a local flag, never re-verifies against the server). Now diffs the
  local row set against the server's ids and removes what's missing — unless the row
  has an in-flight local change, which is left alone so the outbox push discovers the
  same "gone" condition itself and reports it as a real conflict
  (`SyncEngine.markGoneConflict`) instead of silently discarding an unsent edit.
- Docs: [offline-and-pwa.md](./offline-and-pwa.md#pull-sync-reconciling-server-side-deletions).

## 6. Media field preview no longer stretches full-width — `f624e72`

- `MediaIdField` (CMS collection Media field) and `MediaField` (Puck's Image/Video src
  picker) rendered their selected-media preview at a fixed height but 100% width —
  stretched into a distorted banner on a wide field. Both now render into a fixed
  192×128 box with `object-cover`.

## 7. `<body>`'s own background pinned light on public pages — `10e7f10`

- `.theme-light` (the mechanism that keeps the admin dark/light toggle from ever
  reaching the public site) was only ever applied to a wrapper div inside the React
  tree, never to `<body>` itself — `<body>` has its own `bg-background` style that
  still reacted to `.dark` on `<html>`, visible wherever the inner wrapper didn't
  cover the full viewport. The root edge shell now classifies `page.component` the
  same way `LayoutShell.tsx` already does client-side and applies `.theme-light` to
  `<body>` itself, server-side, so the two can't drift.
- Docs: [frontend.md](./frontend.md#theme-scoping-important).

## 8. Simplified content editor for kit pages with no block content — `3f19799`

- **Root problem:** a kit page's **Edit content region** always opened the full Puck
  builder — empty canvas, full component palette — even when the resolved template has
  nothing block-composable (a record-bound page like an article detail, or one branch of
  a router-style kit that dispatches many sub-templates by `path`). `editableRegion` is
  one flag for the whole kit, so it can't say "this branch has nothing, that one does."
- A kit can now export `resolveCapability(ctx): KitCapability`, resolved **per Page row**
  (`path` + core role slot) instead of per kit: a real block region (unchanged), a small
  kit-declared set of fields (text/richtext/url/toggle/select/image/video — new
  `pages.content_fields`/`draft_content_fields`, staged/published exactly like
  `content`/`seo`), or nothing. The admin now shows, respectively: the normal builder
  scoped to the region; a plain schema-driven form (`KitFieldsEditor`) beside a live
  preview of the real page, autosaving to a draft; or a disabled action (no more empty
  canvas). Optional and back-compatible — a kit with no `resolveCapability` behaves
  exactly as the plain `editableRegion` flag already did.
- Also fixed along the way: the admin preview route (`/admin/pages/:id/preview`, used by
  the new editor's live iframe) never showed staged draft content, and was blocked from
  being framed at all by the site-wide `frame-ancestors 'none'` / `X-Frame-Options: DENY`
  default — relaxed to `'self'`/`SAMEORIGIN` for that one auth-gated route. The Pages
  list's "Edit content region" menu gate was also still reading the old kit-wide flag
  instead of the new per-page capability.
- Docs: [code-pages.md](./code-pages.md#editable-fields-no-region),
  [custom-templates.md](./custom-templates.md#editable-fields-optional-per-sub-template),
  [USER_GUIDE.md](../USER_GUIDE.md#custom-code-templates-kits).
