# Plugins

Driftless supports **plugins**: self-contained features that live in one folder under
`plugins/<name>/` and co-locate their back-end (routes, controllers, services, models,
migrations) with their front-end (`ui/`). Plugins can be **enabled / disabled at runtime**
from the admin **Plugins** page (`/admin/plugins`) without a server restart.

See the working example: [`plugins/announcements/`](../../plugins/announcements).

## Folder layout

```
plugins/
  types.ts                 # PluginManifest interface (do not edit per-plugin)
  registry.ts              # static list of plugins — ADD ONE LINE per new plugin
  tsconfig.json            # type-checks plugins/<name>/ui (client preset)
  <name>/
    plugin.ts              # manifest: name, label, permissions, adminMenu, registerRoutes
    routes.ts              # registerRoutes(router, middleware)
    models/                # Lucid models
    migrations/            # auto-discovered by config/database.ts
    services/
    controllers/           # admin + public HTTP handlers
    ui/
      admin/index.tsx      # FE dashboard  → renders in AdminLayout
      public/index.tsx     # FE public     → renders in PublicLayout
```

## Two front-ends per plugin

A plugin can ship an **admin dashboard** and a **public (user-facing)** page. They are
resolved through the `plugins/` page namespace in [`inertia/app.tsx`](../../inertia/app.tsx):

| `inertia.render(...)` name | File |
|----------------------------|------|
| `plugins/<name>/admin/index`  | `plugins/<name>/ui/admin/index.tsx` |
| `plugins/<name>/public/index` | `plugins/<name>/ui/public/index.tsx` |

Render from a controller with the typed helper:

```ts
import { renderPage } from '#helpers/inertia_render'
return renderPage(inertia, 'plugins/announcements/admin/index', props)
```

Layout selection lives in [`layout-shell.tsx`](../../inertia/components/layout-shell.tsx):
`plugins/<name>/admin/*` → `AdminLayout` (sidebar, ability/offline providers); everything
else (e.g. `plugins/<name>/public/*`) → `PublicLayout`.

Plugin UI imports the shared client code via `~/*` (e.g. `~/components/data-table`,
`~/lib/api-client`). **Reuse the shared `DataTable` for any table** — same rule as the rest
of the app.

## The manifest (`plugin.ts`)

```ts
import type { PluginManifest } from '#plugins/types'
import { registerRoutes } from '#plugins/<name>/routes'

const plugin: PluginManifest = {
  name: '<name>',               // unique, equals the folder name (toggle key)
  label: 'Human Name',
  description: '…',
  version: '1.0.0',
  autoEnable: true,             // enabled on first detection (default true)
  permissions: [{ name: '<name>:manage', description: '…' }],
  adminMenu: { title: '…', href: '/admin/<name>', icon: 'Megaphone' }, // lucide name
  registerRoutes,
}
export default plugin
```

`icon` is a lucide-react name resolved by the sidebar's `PLUGIN_ICONS` map
([`sidebar.tsx`](../../inertia/components/admin/sidebar.tsx)); unknown names fall back to `Plug2`.

## Routes & the runtime guard

Plugin routes are **always registered at boot** (via `registerAllPluginRoutes` in
[`start/routes.ts`](../../start/routes.ts)) and **guarded per-request** by the
`pluginEnabled` named middleware. Toggling does not register/unregister routes — it flips a
DB flag that the guard reads (through an in-memory cache), so it takes effect on the next
request **without a restart**.

```ts
export function registerRoutes(router, middleware) {
  router.get('/admin/<name>', [AdminController, 'page'])
    .use(middleware.auth())
    .use(middleware.pluginEnabled({ name: '<name>' }))

  router.group(() => { /* /api/admin/<name>… */ })
    .use(middleware.auth())
    .use(middleware.permission({ permission: '<name>:manage' }))
    .use(middleware.pluginEnabled({ name: '<name>' }))

  router.get('/<name>', [PublicController, 'page'])         // public
    .use(middleware.pluginEnabled({ name: '<name>' }))
}
```

When disabled, the guard returns **404** for `/api/*` requests and **redirects** page
requests (`/admin/*` → `/admin/plugins`, otherwise → `/`).

## How it wires up on boot

[`providers/plugins_provider.ts`](../../providers/plugins_provider.ts) (mirrors
`cms_provider`) runs on boot and:

1. **Reconciles** the registry against the `plugins` table — inserts a row for each
   newly-detected plugin (`enabled = autoEnable ?? true`), keeps `version` in sync.
2. **Mints** every plugin's declared permissions into the RBAC tables (like
   `CmsPermissionsService`). Plugin permissions are covered by the `*` wildcard
   (SUPERADMIN); grant them to other roles via the **Roles** page.

State + caching live in [`app/services/plugins_service.ts`](../../app/services/plugins_service.ts)
(`isEnabled`, `setEnabled`, `reconcile`, `enabledMenu`). The sidebar lists enabled plugins'
menu entries via `GET /api/admin/plugins/menu`.

## Managing plugins

The admin **Plugins** page ([`inertia/pages/admin/plugins.tsx`](../../inertia/pages/admin/plugins.tsx))
lists detected plugins with an **Active** switch. Requires the `plugin:manage` permission
(seeded to SUPERADMIN + ADMIN). Disabling keeps the plugin's data; it is restored on
re-enable. **Disable ≠ uninstall** — uninstall (migration rollback + data removal) is not
implemented.

## Adding a plugin (checklist)

1. Create `plugins/<name>/` following `plugins/announcements/` (manifest, routes,
   model, migration, service, controllers, `ui/admin` + `ui/public`).
2. Register it: add one import line to [`plugins/registry.ts`](../../plugins/registry.ts).
3. `node ace migration:run` (migrations are auto-discovered).
4. `npm run typecheck` then `npm run build` once (see caveat below).

## Caveat: build-time front-end

Plugins are **build-time**, not hot-pluggable. Enable/disable is instant at runtime, but a
**new plugin folder needs one `npm run build`** because Vite bundles plugin FE at build time
(`import.meta.glob('../plugins/*/ui/**/*.tsx')`). Dropping a folder onto a running prod
server without rebuilding will not surface its pages. True runtime FE drop-in (Module
Federation) is out of scope.

## Config touch points (already set up)

- [`package.json`](../../package.json) — `#plugins/*` import alias; `typecheck` includes
  `plugins/tsconfig.json`.
- [`tsconfig.json`](../../tsconfig.json) — **excludes** `plugins/**/ui/**` from the server
  build (those are client/React files); [`plugins/tsconfig.json`](../../plugins/tsconfig.json)
  type-checks them with the client preset.
- [`vite.config.ts`](../../vite.config.ts) — `@plugins` alias.
- [`inertia/css/app.css`](../../inertia/css/app.css) — `@source "../../plugins"` so Tailwind
  scans plugin UI.
- [`config/database.ts`](../../config/database.ts) — auto-discovers `plugins/*/migrations`.
- [`start/kernel.ts`](../../start/kernel.ts) — `pluginEnabled` named middleware.
- [`adonisrc.ts`](../../adonisrc.ts) — `plugins_provider` registered.
