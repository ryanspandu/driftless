# Modules

First-party **app modules**: large core feature areas (e.g. a task tracker / project
management) built as self-contained folders under `modules/<name>/`, co-locating back-end
(routes, controllers, services, models, migrations) and front-end (`ui/`). Same idea as
[plugins](./plugins.md), tuned for **core** code instead of optional add-ons.

> Status: **implemented.** Reference example: `modules/tasks/`.

## Modules vs plugins

| | Plugin | Module |
|---|---|---|
| Intent | optional / third-party add-on | first-party core feature area |
| Toggle | DB (`plugins` table) at `/admin/plugins` | DB (`modules` table) at **Settings → Application** |
| Route guard | `auth` + `permission` + `pluginEnabled` | `auth` + `permission` + `moduleEnabled` |
| Sidebar | one entry under "Plugins" | first-class **"Apps"** group (parent + sub-items) |
| Coupling | sandbox-ish | may freely import core; **core must never import a module** (one-way) |

Both register routes at boot and are guarded per-request, so toggling takes effect without a
restart. **Rule of thumb:** optional add-on → plugin; part of the product → module.

## Folder layout

```
modules/
  registry.ts        # static list of manifests + helpers (one import line per module)
  types.ts           # ModuleManifest, ModuleNav, defineModule()
  tsconfig.json      # type-checks modules/<name>/ui (client preset)
  <name>/
    module.ts        # export default defineModule({ … })
    routes.ts        # registerRoutes(router, middleware)
    migrations/      # auto-discovered (config/database.ts), run with `node ace migration:run`
    controllers/  services/  models/  validators/
    ui/admin/<page>.tsx   # page name "modules/<name>/admin/<page>"
```

## Manifest (`modules/<name>/module.ts`)

```ts
import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/<name>/routes'

export default defineModule({
  name: '<name>',                 // unique key = folder name
  label: 'Tasks',
  description: '…',
  version: '1.0.0',
  autoEnable: true,
  permissions: [
    { name: '<name>:read', description: '…' },
    { name: '<name>:manage', description: '…' },
  ],
  nav: {                          // first-class sidebar entry, shown when enabled
    label: 'Tasks',
    icon: 'ListChecks',           // Phosphor name (curated list — see phosphor-icon.tsx)
    order: 20,
    href: '/admin/tasks',         // flat entry…
    // items: [{ label, href, icon?, permission? }],  // …or a collapsible group
    permission: '<name>:read',    // hide the group unless the user holds this
  },
  registerRoutes,
})
```

## Backend wiring (all already in place)

- **Registry** `modules/registry.ts`: `MODULES: ModuleManifest[]` (one import line per module),
  `registerAllModuleRoutes()`, `allModulePermissions()`, `bootModules()`.
- **Routes** registered from `start/routes.ts` via `registerAllModuleRoutes(router, middleware)`.
  Each route uses `middleware.auth()` + `middleware.permission({ permission })` +
  `middleware.moduleEnabled({ name })`. Split GET (`:read`) from writes (`:manage`).
- **Toggle** = `modules` table + `app/models/module.ts` + `app/services/modules_service.ts`
  (mirrors `PluginsService`: cached `isEnabled`, `reconcile`, `mintPermissions`, `setEnabled`,
  `enabledMenu`). Guard = `app/middleware/module_enabled_middleware.ts` (disabled → 404 API /
  redirect to Settings for pages).
- **Provider** `providers/modules_provider.ts` (registered in `adonisrc.ts` after the plugins
  provider): on boot, reconciles the registry into the `modules` table, mints permissions, and
  runs each enabled module's optional `boot(app)` hook.
- **Migrations** auto-discovered: `config/database.ts` `moduleMigrationPaths()` adds
  `modules/<name>/migrations` to the Lucid paths.
- **Imports**: `#modules/*` mapped in `package.json` (mirrors `#plugins/*`).
- **Menu API**: `GET /api/admin/modules/menu` (any admin) → enabled modules' nav, ordered.

## Frontend wiring (all already in place)

- **Page resolve** `inertia/app.tsx`: page name `modules/<name>/<area>/<page>` → file
  `modules/<name>/ui/<area>/<page>.tsx` (glob `../modules/*/ui/**/*.tsx`). **CSR only** —
  `inertia/ssr.tsx` is untouched (only `public/page_ssr` is SSR'd).
- **Layout** `inertia/components/layout-shell.tsx`: `^modules/<name>/admin/` → `AdminLayout`
  (sidebar chrome).
- **Tailwind** `inertia/css/app.css`: `@source "../../modules"`. **Vite alias** `@modules`.
  **tsconfig**: root excludes `modules/**/ui/**`; `modules/tsconfig.json` is in the `typecheck`
  script. Module UI imports `~/components/*`, `~/lib/*`, `~/hooks/*` freely.
- **Sidebar** `inertia/components/admin/sidebar.tsx`: `useModulesMenu()` →
  `/api/admin/modules/menu`, rendered under an **"Apps"** section (collapsible parent or flat
  link), permission-filtered client-side via `useAbility()`. Icons resolved by name via
  `inertia/lib/phosphor-icon.tsx` (`phosphorIconByName`, curated map → `PHOSPHOR_ICON_NAMES`).
- **Hook** `inertia/hooks/api/use-modules.ts`: `useModulesMenu`, `useModulesList`,
  `useToggleModule`.

## Settings → Application (`/admin/settings/application`)

`inertia/pages/admin/settings/application.tsx` — one panel, `settings:manage`:

- **Public site** — landing on/off (dashboard-only SAAS). Off → `PublicController.home`/`post`
  redirect to dashboard/login.
- **Dashboard management** — hide core sidebar menus. Hidden menus' **pages return 404** (not
  just hidden): `app/middleware/nav_enabled_middleware.ts` maps page prefixes → nav title and
  throws 404, rendered as the in-dashboard 404 page (see below).
- **Modules** — enable/disable each module (the DB toggle).

State lives in `web_settings` section `app_config` (`landing_enabled`, `hidden_nav` CSV), read
by `WebSettingsService.getAppConfig()` and exposed to the sidebar via `GET /api/admin/nav-config`.
`applyPatches` resets to default (drops the override row) when a value is empty.

## In-dashboard 404

`inertia/pages/admin/not_found.tsx` (illustration + "Back to dashboard"), rendered inside
`AdminLayout`. The exception handler (`app/exceptions/handler.ts`) renders it for **any** 404 on
an `/admin/*` path (hidden menus + genuinely missing routes); public 404s still use
`errors/not_found`. Middleware short-circuits by **throwing** a 404 (a middleware that returns an
inertia render is not flushed to the response).

## Add a module

```bash
node ace make:module project-management --label="Project Management" --icon=Kanban
```

Scaffolds `modules/project-management/` (manifest, routes, controller, admin page) and prints the
`modules/registry.ts` line to add. Then add your models/migrations/services, register the import,
and restart dev (a fresh module folder needs a build to bundle its UI). After migrating,
`modules_provider` reconciles the row + mints the permissions on boot — grant them to a role
(superadmin holds all).

## Related

- [plugins.md](./plugins.md) · [frontend.md](./frontend.md) · [auth-and-permissions.md](./auth-and-permissions.md)
