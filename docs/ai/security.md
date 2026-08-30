# Security hardening and operations

This guide describes the application security boundaries, the operational steps
required when upgrading an existing installation, and the rules for extending
the system without weakening them.

## Content and page builder HTML

User-authored HTML is sanitized on the server at every write boundary:

- article bodies (`contents.body`);
- CMS fields of type `RICHTEXT`;
- Puck `RichText` blocks in pages and templates.

The formatting allowlist keeps normal rich text such as headings, lists, links,
tables, code, and images. Scripts, event-handler attributes, unsafe URL schemes
such as `javascript:`, inline styles, and unrecognised tags/attributes are
removed. Do not introduce a new `dangerouslySetInnerHTML` sink for editor input
without routing its value through `#services/html_sanitizer_service` first.

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

## Media uploads and SVG

User media is stored outside `public/` by default at `storage/media` and served
only through the controlled media route. `MEDIA_STORAGE_PATH` must remain
outside `public/`; startup rejects an unsafe path. Set `MEDIA_URL_PREFIX=/media`
for new installations (the legacy `/uploads` route remains available for old
database rows).

Every upload is checked in two stages:

1. Adonis multipart size/extension validation must pass (`file.isValid`).
2. The stored bytes are inspected with `file-type`; the server chooses the MIME
   type and extension. Client filenames and MIME headers are never trusted.

SVG has no reliable magic number, so its XML is passed through a strict static
SVG sanitizer before it is persisted. It removes or rejects scripts, event
attributes, links/references, `foreignObject`, animation, styles, and external
or data URLs. SVG is re-sanitized when served as defense in depth. Documents
are sent as downloads; only known safe image types are rendered inline.

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
