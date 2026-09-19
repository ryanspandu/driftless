# Security hardening and operations

This guide describes the application security boundaries, the operational steps
required when upgrading an existing installation, and the rules for extending
the system without weakening them.

## Content and page builder HTML

User-authored HTML is sanitized on the server at every write boundary:

- article bodies (`contents.body`);
- CMS fields of type `RICHTEXT`;
- Puck `RichText` blocks in pages and templates.

Product descriptions (`ecommerce_products.description`) and task descriptions
(`tasks.description`) are HTML sanitized the same way — they used to be TipTap
JSON with no sanitization. All of these fields are edited with the same
`ArticleEditor` (`inertia/components/admin/article-editor.tsx`), so the
allowlist in `sanitizeRichText()` is deliberately as wide as that editor's
toolbar can produce, and no wider:

- headings `h1`–`h6`, lists (incl. task-list checkboxes), links, tables (with
  `colgroup`/`col`), code, images, `details`/`summary`, `mark`, `sub`/`sup`;
- a **narrow, per-property regex-validated** set of inline styles on text/image/
  table-cell elements — `color`, `background-color`, `font-family`, `font-size`,
  `line-height`, `text-align`, `width` — via `sanitize-html`'s `allowedStyles`;
- `iframe` only from `www.youtube-nocookie.com` (the editor's YouTube embed);
  `CodeEmbed` keeps its own, broader provider list (see below) through an
  explicit `allowedIframeHostnames: undefined` override.

Scripts, event-handler attributes, unsafe URL schemes such as `javascript:`, any
other inline style property, and unrecognised tags/attributes are removed. Do
not introduce a new `dangerouslySetInnerHTML` sink for editor input without
routing its value through `#services/html_sanitizer_service` first.

**What this means for a kit that renders a body.** A custom template
([custom-templates.md](./custom-templates.md#rich-text-from-the-cms--what-the-sanitiser-leaves-you)) that puts
sanitised HTML into `dangerouslySetInnerHTML` receives markup with **no `<div>`** (the tag is not on the list;
only `CodeEmbed` widens it), **no `id` attribute on any tag** (`id` is not an allowed attribute, so
`<h2 id="intro">` is stored as `<h2>`), `class` allowed on **every** allowed tag, and only the narrow inline
styles above (on `span`, `p`, `h1`–`h6`, `img`, `td`, `th`). Do not rely on wrapper elements or ids inside the
body. Add ids **at render time** — a string transform such as the `aftrn-web` kit's `withHeadingIds` (every
`<h2>` gets a slug id, in the server-rendered HTML too) — and style the body with **descendant selectors on a
wrapper you own** (`.prose h2 { … }`, `.prose figure { … }`), not with classes you expect the author to have
typed.

### Code Embed and trusted snippets

`CodeEmbed` is intentionally **not** an arbitrary-code escape hatch. On save it
allows presentation HTML and HTTPS iframes only from these providers:

- YouTube (`youtube.com`, `www.youtube.com`)
- Vimeo (`player.vimeo.com`)
- Google Maps (`www.google.com`, `maps.google.com`)
- Facebook (`www.facebook.com`)
- Spotify (`open.spotify.com`)

It strips scripts, event handlers, styles, `javascript:` URLs, and unapproved
iframe origins. Add a provider only after reviewing its exact iframe origin and
then add that origin to both the sanitizer allowlist and CSP `frameSrc`.

Custom CSS/JS belongs in the trusted snippet feature. It is privileged: global
page code, page-level snippets, templates containing snippets, and `CODE` page
changes require `settings:manage` on the server. Never grant that permission to
ordinary content authors.

## Content Security Policy

Shield CSP is enforced in [`config/shield.ts`](../../config/shield.ts), with a
per-response nonce (`@nonce`) for scripts and style elements. Inertia exposes
the nonce as `cspNonce`; public-page trusted snippets attach it to generated
`<script>` and `<style>` tags.

The policy blocks inline event handlers, plugin/object content, framing by other
sites, and arbitrary frame/script origins. Puck still relies on React `style`
attributes, so `style-src-attr 'unsafe-inline'` is deliberately scoped to style
attributes; it does not permit inline JavaScript.

When adding an integration, verify it in a production-like CSP environment and
make the smallest corresponding directive change. Do not add `unsafe-inline` to
`script-src` or a broad `https:` source to `script-src`/`frame-src`.

### Generated stylesheets and the nonce

The strict production policy is `style-src 'self' '@nonce'
https://fonts.googleapis.com` with `style-src-attr 'unsafe-inline'`. The
`unsafe-inline` on `style-src-attr` is why inline `style=""` attributes (a
`Box`'s base props and its live state-preview) need no nonce; only `<style>`
**elements** do. Those elements come from the page builder itself, so each must
carry the request nonce:

- A published `Box` emits a generated `<style>` for its responsive `@media`
  rules and interaction-state (`:hover`/`:focus`/`:active`) rules. The nonce
  reaches it through a React context: `NonceContext`
  ([`inertia/puck/breakpoints.ts`](../../inertia/puck/breakpoints.ts)),
  provided by `PublicPageView` from `usePage().props.cspNonce`
  ([`inertia/puck/public-page-view.tsx`](../../inertia/puck/public-page-view.tsx))
  and consumed in
  [`inertia/puck/style-fields.tsx`](../../inertia/puck/style-fields.tsx),
  which stamps `nonce` onto that generated element.
- The builder canvas injects a nonced `<style>` with the operator palette and
  the saved `--color-<slug>` values scoped to `.theme-light`
  ([`inertia/puck/builder-shell.tsx`](../../inertia/puck/builder-shell.tsx)).
- `SiteThemeStyle`
  ([`inertia/components/layout-shell.tsx`](../../inertia/components/layout-shell.tsx))
  is nonced the same way.

The nonce is a per-request Shield value. `inertia_middleware` shares it as
`cspNonce` (`ctx.inertia.always(ctx.response.nonce)`) and
[`resources/views/inertia_layout.edge`](../../resources/views/inertia_layout.edge)
exposes it as `<meta name="csp-nonce">`.

### SSG snapshots and the nonce sentinel

`renderMode='SSG'` pages cache their full rendered HTML
([`app/services/page_renderer.ts`](../../app/services/page_renderer.ts) →
`pages.rendered_html`) and re-serve it verbatim. But Shield sets a **fresh**
nonce in every response's CSP header, so a nonce baked into the snapshot would
never match and every nonced `<style>`/`<script>` in it would be dropped.

The fix is a restamp. On cache-write the render-time nonce is replaced with a
sentinel, `CSP_NONCE_SENTINEL` (`__CSP_NONCE__`, exported from
`page_renderer.ts`); on serve,
[`app/controllers/pages_public_controller.ts`](../../app/controllers/pages_public_controller.ts)
swaps the sentinel back to the current request's nonce. The request that first
renders the snapshot still receives its real nonce, matching the header Shield
already set for it. SSR/CSR responses render fresh with `no-store`, so they use
the real per-request nonce directly and need no sentinel.

## Media uploads and SVG

User media is stored outside `public/` by default at `storage/media` and served
only through the controlled media route. `MEDIA_STORAGE_PATH` must remain
outside `public/`; startup rejects an unsafe path. Set `MEDIA_URL_PREFIX=/media`
for new installations (the legacy `/uploads` route remains available for old
database rows).

`STORAGE_DRIVER=s3` moves the bytes into an S3-compatible bucket instead — the
same controlled route still fronts every request (a public `Media.url` is
always the site's own relative path, never a bucket URL), so this changes
nothing about the access-control posture above. See
[storage-driver.md](./storage-driver.md).

Every upload is checked in two stages:

1. Adonis multipart size/extension validation must pass (`file.isValid`).
2. The stored bytes are inspected with `file-type`; the server chooses the MIME
   type and extension. Client filenames and MIME headers are never trusted.

SVG has no reliable magic number, so its XML is passed through a strict static
SVG sanitizer before it is persisted. It removes or rejects scripts, event
attributes, links/references, `foreignObject`, animation, styles, and external
or data URLs. SVG is re-sanitized when served as defense in depth. Documents
(PDF, Word, fonts) are sent as downloads; only known safe image types AND
`video/mp4`/`video/webm` are rendered inline (video needs `Content-Disposition:
inline` to play in a `<video>` tag rather than force-downloading).

### Existing media rollout

Old files under `public/uploads` can bypass the controlled route because the
static middleware serves that directory first. Upgrade an existing deployment
in this order:

```sh
# Read-only inventory; review every "quarantine" and "missing" result.
node ace media:audit

# Move safe referenced files into controlled storage, sanitize SVG, and move
# unrecognised/unsafe files to storage/media-quarantine.
node ace media:audit --apply
```

Keep `storage/media-quarantine` out of public serving. Investigate or delete
quarantined files only after confirming they are not needed. The command is
idempotent enough to rerun after a failed deployment, but use a backup for a
large production library.

## Re-sanitizing existing content

New write boundaries do not automatically change old database values. Before
enabling the stricter deployment policy, run:

```sh
node ace security:resanitize-content
node ace security:resanitize-content --apply
```

The first command is a dry run. Applying it rewrites article/CMS rich text and
Puck documents through the current sanitizer and invalidates all SSG snapshots,
so previously cached unsafe HTML is not served.

## Authentication, RBAC, and seeds

- Google OAuth requires a verified Google email before it creates an account or
  links a Google subject to an existing email account. An already-bound Google
  subject can continue to sign in.
- Settings reads for website/page code require `settings:manage`; draft preview
  requires `page:read`.
- Production seeding requires explicit, unique `SEED_ADMIN_EMAIL`,
  `SEED_ADMIN_PASSWORD`, and `SEED_ADMIN_USERNAME`. It rejects
  `FORCE_SEED_PASSWORD=1`. Development/test defaults exist only to support the
  local test fixture; never copy them into production.

## Verification checklist

Before release, run:

```sh
npm run typecheck
npm test
npm audit --omit=dev --offline
```

Test new security-sensitive behavior with malicious rich text, `javascript:`
links, SVG scripts/references, renamed HTML uploads, wrong MIME types,
oversized uploads, permission failures, OAuth email verification, and CSP
headers/nonces. The unit suite includes focused sanitizer coverage in
`tests/unit/security_sanitizers.spec.ts`.
