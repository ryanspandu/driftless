# `screenshot_page` — setup & operations (Playwright)

The MCP tool **`screenshot_page`** renders a page's draft in a **real headless browser** and
returns the actual PNG pixels, so the AI page builder can *see* what it built instead of
authoring blind. Unlike `render_page` (which returns script-stripped HTML text), it captures
true visual layout, spacing, proportion, overflow and typography — and because a real browser
executes client JS, it also renders **CSR** pages that come back empty from `render_page`.

Rationale and the wider roadmap: [mcp-ai-builder-research-webflow-shopify.md](./mcp-ai-builder-research-webflow-shopify.md).

## How it works (data path)

```
screenshot_page (MCP tool, mcp_tools.ts / server/src/index.ts)
  → GET /api/mcp/v1/pages/:id/screenshot?viewport=…   (modules/mcp/routes.ts, guard builder:read)
    → PagesController.screenshot                        (modules/mcp/controllers/api/pages_controller.ts)
      → ensurePreviewToken(id) + http://<self>/preview/<token>   (same URL as render)
      → screenshotUrl()                                 (app/services/screenshot_service.ts)
          Playwright Chromium (shared singleton) → page.screenshot({ fullPage:true })
          → sharp() width-cap 1000px → PNG
      ← { url, viewport, width, height, base64, mimeType }   (base64 JSON — survives the text/JSON MCP transport)
  ← MCP image content block  { type:'image', data:<base64>, mimeType:'image/png' } + a small text block
```

Viewports: `desktop` 1280×800, `tablet` 768×1024, `mobile` 390×844. Output PNG is downscaled to
≤1000px wide (via `sharp`) to keep the base64 payload — and the model's image-token cost — sane.

## Why Playwright

`sharp` (already a dependency) can *rasterise* SVG/raster bytes but **cannot render a web page** —
it has no layout engine. Faithful pixels of a real Tailwind-styled, possibly JS-hydrated Puck page
need an actual browser. Playwright drives Chromium headless and is already in the tree (it was a
transitive of `@japa/browser-client`); this feature **promotes it to an explicit dependency**
(`package.json` → `playwright`).

### The one thing to understand about Playwright: version ↔ browser-build coupling

Playwright does **not** use your system Chrome. Each Playwright version is pinned to a specific
Chromium **build number** and downloads that build into a cache. `playwright@1.60.0` wants Chromium
build **1223**; a cache holding a different build (e.g. `1234`, left by another Playwright version)
fails at launch with:

```
browserType.launch: Executable doesn't exist at …/chromium_headless_shell-1223/…
```

The fix is always the same: run `npx playwright install chromium` **with the same Playwright
version the app resolves** (i.e. from this repo's `node_modules`). Re-run it whenever `playwright`
is upgraded.

Where the browser binaries live is controlled by `PLAYWRIGHT_BROWSERS_PATH`:
- **Unset (local dev):** Playwright's default per-user cache (`~/Library/Caches/ms-playwright` on
  macOS, `~/.cache/ms-playwright` on Linux).
- **Production:** set to a path on the shared volume (see below) so binaries outlive a release and
  both the install step and the runtime agree on the location.

---

## Development

Node ≥ 24 (already required). After pulling this change:

```bash
npm install                       # playwright is now an explicit dependency
npx playwright install chromium   # downloads the Chromium build this Playwright version needs
```

Then the normal dev loop (see [dev-workflow.md](./dev-workflow.md)):

```bash
docker compose up -d
node ace migration:run && node ace db:seed   # first time
npm run dev
```

- **Restart the dev server after touching `app/services/**` or the MCP controllers/routes.** Services
  are not hot-reloaded (only `inertia/**` gets HMR), so a running `npm run dev` will not pick up
  `screenshot_service.ts` / the new route until restarted.
- No extra system packages are needed on macOS for local dev; Chromium ships self-contained there.

### Smoke test (dev)

With the dev server up and a personal access token that has `builder:read`:

```bash
# 1. list a page id (or create one via the MCP tools)
curl -s -H "Authorization: Bearer $DRIFTLESS_TOKEN" http://localhost:3333/api/mcp/v1/pages | jq '.[0].id'

# 2. screenshot it — expect JSON with a long base64 field
curl -s -H "Authorization: Bearer $DRIFTLESS_TOKEN" \
  "http://localhost:3333/api/mcp/v1/pages/<ID>/screenshot?viewport=desktop" \
  | jq '{url, viewport, width, height, bytes: (.base64|length)}'

# 3. eyeball the pixels
curl -s -H "Authorization: Bearer $DRIFTLESS_TOKEN" \
  "http://localhost:3333/api/mcp/v1/pages/<ID>/screenshot?viewport=desktop" \
  | jq -r '.base64' | base64 -d > /tmp/shot.png && open /tmp/shot.png
```

Through an MCP client, the equivalent is: `create_page` → `set_page_content` → **`screenshot_page`**
(the tool returns the image inline). This is step 8 of the build loop in `SERVER_INSTRUCTIONS`.

---

## Production

Driftless is self-hosted from a source checkout with a shared state directory and a full
`node_modules` (never `npm ci --omit=dev`). See [../DEPLOYMENT.md](../DEPLOYMENT.md) for the full
model. Two things must be true for `screenshot_page` to work in prod:

1. **The Chromium browser binary is installed**, into a location that survives releases.
2. **Chromium's shared libraries are present** on the host/image (Debian/Ubuntu ship without them).

Put the browser under `shared/` (it outlives any single release, like `uploads/` and `storage/`):

```bash
export PLAYWRIGHT_BROWSERS_PATH=/opt/driftless/shared/ms-playwright
```

Keep that line in `shared/.env` (or the service environment) so **every** process — web, the
release step, and any worker — resolves the same path.

### Bare VPS (PM2 / systemd)

After `npm ci` (which now installs `playwright`), install the browser **and** its system libraries
once — and again after any `playwright` version bump:

```bash
# run as root (or with sudo) — --with-deps apt-installs the shared libraries Chromium needs
PLAYWRIGHT_BROWSERS_PATH=/opt/driftless/shared/ms-playwright \
  npx playwright install --with-deps chromium
```

If you cannot run `--with-deps` (no root at install time), install the browser without it and
apt-install the libraries separately — the same set the Dockerfile lists below.

### Container (Docker)

`deploy/Dockerfile` already does its half:
- **apt-installs Chromium's shared libraries** into the image (`libnss3`, `libgbm1`,
  `libatk-bridge2.0-0`, `libasound2`, `fonts-liberation`, … — the full list is in the Dockerfile).
  These must live in the *image* because the volume only carries `node_modules` + the app, not
  system packages.
- **sets `ENV PLAYWRIGHT_BROWSERS_PATH=/opt/driftless/shared/ms-playwright`.**

The **browser binary itself is not baked into the image** (the image is a thin runtime over a
mounted checkout). Install it onto the volume as part of first setup / the release step:

```bash
# inside the container, against the mounted checkout
npx playwright install chromium      # PLAYWRIGHT_BROWSERS_PATH is already set by the image
```

### Where it runs / resource notes

- The screenshot currently runs **inline in the web process**. Chromium launches once and is reused
  (a shared singleton in `screenshot_service.ts`), so the cost is per-screenshot, not per-launch.
- A headless Chromium adds ~100–200 MB RSS while alive. On small boxes, keep that in mind alongside
  the existing front-end-build memory guidance in DEPLOYMENT.md.
- **Scale path (not yet done):** move screenshotting to the `queue:work` / worker process and point
  Chromium at the internal web URL, so a heavy capture never blocks a web request. Left as a
  follow-up; noted here so it is not rediscovered.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Executable doesn't exist at …chromium_headless_shell-<n>…` | Browser build doesn't match the installed Playwright version | `npx playwright install chromium` from this repo's `node_modules` (re-run after any `playwright` upgrade) |
| Launch error mentioning `libnss3` / `libgbm` / `libatk` … | Chromium's shared libraries are missing (bare Debian/Ubuntu or a slim image) | `npx playwright install --with-deps chromium` as root, or apt-install the libs the Dockerfile lists |
| Screenshot endpoint returns `500` with a Chromium message | Usually one of the two above, surfaced from `screenshotUrl()` | Check the two rows above; confirm `PLAYWRIGHT_BROWSERS_PATH` resolves and is readable by the app user |
| Blank/short image on a page that has content | The draft genuinely renders empty, **or** a very slow network never reaches idle | The service falls back from `networkidle` to `load`; if still blank, open the page's `/preview/<token>` URL in a browser to confirm it renders at all |
| Times out after ~30s | Page never settles (long polling, a stuck request) | Expected ceiling; investigate the page. The timeout is in `screenshot_service.ts` (`timeoutMs`) |
| Works in dev, fails in prod only | `PLAYWRIGHT_BROWSERS_PATH` differs between the install step and the runtime, or the browser was never installed onto the volume | Set the env var everywhere and re-run `npx playwright install chromium` against the volume |

## Files

- `app/services/screenshot_service.ts` — Playwright singleton + `sharp` downscale + viewport map.
- `modules/mcp/controllers/api/pages_controller.ts` — `screenshot` action (reuses the preview token).
- `modules/mcp/routes.ts` — `GET /api/mcp/v1/pages/:id/screenshot`.
- `modules/mcp/mcp_tools.ts` + `modules/mcp/server/src/index.ts` — the `screenshot_page` tool
  (mirrored copies; keep in sync), widened `ToolResult`, and the `runImage` result-shaper.
- `deploy/Dockerfile` — Chromium shared libs + `PLAYWRIGHT_BROWSERS_PATH`.
- `package.json` — `playwright` as an explicit dependency.

## Related

- [mcp-ai-builder-research-webflow-shopify.md](./mcp-ai-builder-research-webflow-shopify.md) — why this exists + P1–P4 roadmap
- [dev-workflow.md](./dev-workflow.md) · [../DEPLOYMENT.md](../DEPLOYMENT.md) · [pages-builder.md](./pages-builder.md)
