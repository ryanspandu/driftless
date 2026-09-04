# Modules

**One package system.** Everything installable lives in `modules/<name>/` as a
self-contained folder co-locating back-end (routes, controllers, services, models,
migrations) and front-end (`ui/`).

> Status: **implemented.** Reference examples: `modules/tasks/` (app),
> `modules/announcements/` (plugin), `modules/ecommerce/` (a large app),
> `modules/mcp/` (an app that adds a token-authed **builder-API** at
> `/api/mcp/v1/*` plus a bundled MCP server so an AI can build the whole site —
> see [modules/mcp/README.md](../../modules/mcp/README.md)).

## Apps and plugins are the same thing

There used to be two systems, `modules/` and `modules/`, that were ~85% the same code. They
drifted — the plugin half's enabled-cache had no TTL and was simply wrong on a multi-worker
deployment — and keeping them apart would have meant two installers, two verifiers, two
rollback paths and two safe modes once the marketplace arrived.

So there is one implementation, and **`kind` on the manifest carries the difference**:

|                 | `kind: 'app'` (default)                                         | `kind: 'plugin'`                             |
| --------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Intent          | first-party or vetted feature area                              | third-party add-on                           |
| Surface         | the full manifest                                               | no `boot`, `maintenance`, `reservedSegments` |
| Everything else | identical — same table, same toggle, same guard, same discovery |                                              |

The narrower plugin surface is a **policy** the installer enforces when validating a
manifest, not a separate implementation. Both register routes at boot and are guarded
per-request, so toggling takes effect without a restart.

## When a module breaks the app

A marketplace makes one failure routine: a package that imports cleanly and then throws
against a live container. If that stopped the process, the operator would be locked out of
the very screen that removes it. Three layers stop it.

**1. Nothing a module does can stop boot.** `discoverModules()` already wrapped each _import_
in try/catch; `bootModules()` now does the same for each `boot(app)` hook. A module that
throws is recorded in `bootFailures`, and `ModulesProvider` then **quarantines** it —
`enabled = false` plus the reason in `modules.boot_error` — so the next restart skips it
instead of repeating the failure forever. The provider still rethrows _infrastructure_
failures (unreachable database, missing table); only a module's own fault is contained.

**2. Safe mode boots with no modules at all.**

| Trigger                         | For                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `DRIFTLESS_SAFE_MODE=1`         | whoever controls the supervisor config                                          |
| `tmp/SAFE_MODE` (file)          | whoever only has a shell — and the installer, which drops it around risky steps |
| `DRIFTLESS_DISABLE_MODULES=a,b` | the surgical version: keep the site running, keep one package out               |

One early return in `discoverModules()` and everything follows: no routes, no boot hooks, no
permissions minted, no reserved segments, no nav.

> **Trap.** Safe mode makes every module look like it vanished. Any future orphan-row pruning
> in `reconcile()` **must** be gated on `!SAFE_MODE && !DISABLED_BY_ENV.size`, or one recovery
> boot silently deletes every module's enabled state.

**3. Recovery commands that never boot the app.** All three use raw `pg` against
`DATABASE_URL` (`app/services/recovery_db.ts`) — reaching for Lucid would boot the container,
the providers and the very module that is preventing startup.

```bash
node ace modules:list                 # on disk vs database, and what failed to boot
node ace modules:disable <name>       # or --all
node ace modules:safe-mode --on|--off
```

`modules:disable` takes effect within ~10s without a restart, because the enabled map is
cached with a short TTL rather than for the process lifetime.

## The contract a package must satisfy

Enforced during discovery, so a package that fails it is refused with a readable reason
rather than loading and breaking later in a way that looks like a bug in the CMS.

| Field               | Meaning                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `engines.driftless` | semver range against `CMS_VERSION`. Omit for bundled packages; set it for anything installed separately |
| `requires.modules`  | name → semver range. **Declared and checked, never resolved** — nothing is installed automatically      |
| `kind: 'plugin'`    | may **not** declare `boot`, `maintenance` or `reservedSegments`                                         |

Those three reach furthest outside a package: `boot` runs arbitrary code against the live
container, `reservedSegments` claims public URLs, and `maintenance` runs on a schedule with
nobody watching. Without the check, `kind` would be a label rather than a boundary.

Dependency pruning **repeats until it settles**. Dropping one module can leave a third
unsatisfied, and stopping after a single pass would load a package whose dependency is not
there — the exact state the check exists to prevent.

## Installing and removing

```bash
node ace modules:install <name>     # compat → migrate → rebuild if ui/ → enable
node ace modules:uninstall <name> --confirm=<name> [--remove-folder]
```

Or from **Settings → Modules**, which spawns exactly the same command. See
"Installing from the admin UI" below for why it has to be a separate process.

`modules:install` exists because the manual steps were previously left to memory, and one of
them fails **silently**: skip the rebuild and the routes work, the module reports itself
enabled, and its admin pages are simply blank — Vite resolves the module glob at build time.
It skips the rebuild entirely when a package ships no `ui/`, which is most backend-only ones.

Order is `migrate → build → enable`, the same order the marketplace installer will use.
Enabling first would expose a module whose tables do not exist yet.

### Installing from the admin UI

The button spawns `node ace modules:install <name> --job=<id>` as a **detached child**. That
is not a performance choice, it is the only thing that works:

- `MODULES` is resolved by a top-level `await` at import, and `config/database.ts` builds
  `migrationPaths` when the config loads. A folder that arrived after boot is invisible to the
  running web process **twice over** — `getModule()` returns undefined _and_ its migrations are
  not in the path list. Only a fresh process can see it.
- The queue worker cannot be used for the same reason: `queue:work` boots the app identically,
  so its `MODULES` is frozen too.
- The child must outlive the parent, because the last step is restarting the parent.

State lives in `module_install_jobs`, one row, written entirely by the child. A unique index on
a nullable `active_lock` column enforces one install at a time across the whole fleet; the
process dying mid-install is a non-event because the row is the state.

The job stops at `awaiting_restart`, never at `succeeded`. Whether it worked is decided after
the restart by `ModuleInstallJobService.resumeOnBoot()`, which is the only observer that can
check the module now loads _and_ is enabled. A process about to be replaced cannot certify its
own outcome.

A module that is already loaded and ships no `ui/` needs no restart at all — that job finishes
immediately.

### Restarting

`app/services/restart_watcher.ts` polls every ~10s (jittered) and restarts when either the
`current` symlink has moved out from under this process, or an install is waiting on a
restart. The jitter _is_ the rolling-restart mechanism under PM2 cluster and templated systemd
units: workers notice independently and leave at different moments, with no coordination.

`requestRestart()` refuses when nothing would bring the process back — see the docblock in
`app/services/supervisor.ts`. `DRIFTLESS_AUTO_RESTART=0` turns the watcher off.

`modules:uninstall` is **the only operation here with no undo** — it drops tables. It asks for
the name twice, honours the manifest's `canUninstall()` veto (e-commerce refuses while any
order has been paid), revokes the permissions **no other installed module declares**, and with
`--remove-folder` moves the directory to `shared/backups/` rather than deleting it.
`modules:maintenance` sweeps backups older than 30 days.

## Lifecycle

| Event                    | What happens                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Folder removed           | `reconcile()` prunes the row — **gated on safe mode**, or one recovery boot would delete every module's enabled state           |
| `version` moves forward  | `onUpgrade(fromVersion)` runs after migrations, before enable. A failure is logged but does **not** disable a module that works |
| `version` moves backward | nothing — there is no upgrade path to run in reverse                                                                            |
| `boot()` throws          | quarantined: disabled, with the reason in `modules.boot_error`                                                                  |

## Health

`/health` is public and deliberately says almost nothing — `{ ok, version }`. Listing
installed packages and versions there would hand an attacker a map of what to look up.

`/api/admin/health` is the operator's view, behind auth: `db`, `assets`, `safeMode`,
discovered module count and the names that failed to boot.

**Both return 503 when the database is unreachable or the built assets do not match their
manifest.** That second condition is the one worth having: it is exactly the state the build
corruption produced — the app boots, every route answers, every page is blank — and the old
hard-coded `{ ok: true }` reported it as healthy.

## Folder layout

```
modules/
  registry.ts        # DISCOVERS modules by scanning this folder — nothing to edit
  types.ts           # ModuleManifest, ModuleNav, defineModule()
  tsconfig.json      # type-checks modules/<name>/ui (client preset)
  <name>/
    module.ts        # export default defineModule({ … })  ← makes the folder a module
    routes.ts        # registerRoutes(router, middleware)
    migrations/      # auto-discovered (config/database.ts)
    controllers/  services/  models/  validators/
    data/            # static files the module carries; serve them from its own route
    scripts/         # its own maintenance scripts
    tests/           # its own specs — the `modules` suite picks them up
    README.md        # its own documentation
    ui/
      admin/<page>.tsx   # page name "modules/<name>/admin/<page>"
      storefront/…       # public pages
      components/ lib/ hooks/   # anything only this module uses
      labels.ts          # breadcrumb labels        (optional)
      puck/blocks.tsx    # page-builder blocks      (optional)
```

## A module is a folder, and nothing outside it

This is the property the whole thing rests on: **a module must be installable by copying one
directory in.** Anything a module needs that lives elsewhere is a file an installer would have to
edit, and an installer unpacking a zip cannot edit core source.

So core never names a module. It discovers contributions by **shape**:

| Contribution                            | How core finds it                                        | Where                                                                                                    |
| --------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| The module itself                       | directory holding `module.ts` / `module.js`              | `modules/registry.ts`                                                                                    |
| Admin & storefront pages                | `import.meta.glob('../modules/*/ui/**/*.tsx')`           | `inertia/app.tsx`                                                                                        |
| Page-builder blocks                     | `import.meta.glob('../../modules/*/ui/puck/blocks.tsx')` | `inertia/puck/module-blocks.ts`                                                                          |
| Page-builder block icons                | the `icons` map on that same default export              | `inertia/puck/module-blocks.ts` → `inertia/puck/overrides.tsx`                                           |
| Breadcrumb labels                       | `import.meta.glob('../../modules/*/ui/labels.ts')`       | `inertia/lib/module-labels.ts`                                                                           |
| Tests                                   | `modules/*/tests/**/*.spec.ts`                           | `adonisrc.ts`, suite `modules`                                                                           |
| Migrations                              | directory scan                                           | `config/database.ts`                                                                                     |
| Permissions, nav, reserved URL segments | manifest fields                                          | `modules/registry.ts`                                                                                    |
| Emails the module sends                 | `registerMailEvent(...)` from `boot()`                   | `app/services/mail_events.ts` — see [mail.md](./mail.md#mail-events--what-can-be-sent-and-whether-it-is) |

Two rules follow, and both are enforced:

- **The folder name is the module name.** `discoverModules` skips a manifest whose `name` differs,
  because the database row, the routes and the enable toggle all key on it — a mismatch would flip
  one module's switch while guarding another's routes.
- **A broken module is skipped, not fatal.** If loading one throws, it is logged and the rest of the
  application boots. Otherwise a half-extracted install would lock the operator out of the very
  screen they need in order to remove it.

Static assets belong in `data/` and are served by the module's own route — see the e-commerce
module's `geo_controller`. Putting them in `public/` would mean a module writing outside its folder.

## Manifest (`modules/<name>/module.ts`)

```ts
import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/<name>/routes'

export default defineModule({
  name: '<name>', // unique key = folder name
  label: 'Tasks',
  description: '…',
  version: '1.0.0',
  autoEnable: true,
  permissions: [
    { name: '<name>:read', description: '…' },
    { name: '<name>:manage', description: '…' },
  ],
  nav: {
    // first-class sidebar entry, shown when enabled
    label: 'Tasks',
    icon: 'ListChecks', // Phosphor name (curated list — see phosphor-icon.tsx)
    order: 20,
    href: '/admin/tasks', // flat entry…
    // items: [{ label, href, icon?, permission? }],  // …or a collapsible group
    permission: '<name>:read', // hide the group unless the user holds this
  },
  registerRoutes,
})
```

Optional hooks a manifest may also declare:

| Hook             | Purpose                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tables`         | Tables the module owns, in creation order. Required for install/uninstall from the admin — see [Installing](#installing-a-module-from-the-admin) |
| `canUninstall()` | Veto destruction that would lose records the operator cannot recreate                                                                            |
| `boot(app)`      | Register services, listeners or resolvers at startup                                                                                             |
| `maintenance()`  | Periodic housekeeping — see below                                                                                                                |

### `maintenance()` — scheduled housekeeping

For work that must happen on a schedule whether or not a queue worker is alive. Run by
`node ace modules:maintenance`, which is meant for cron:

```cron
*/5 * * * * cd /srv/driftless && node ace modules:maintenance >> /var/log/driftless-maintenance.log 2>&1
```

Deliberately not a queue job. Sweeps of this kind decide who owns inventory and who gets
paid, so they must not depend on Redis being up — the queue is an accelerator, not the
source of truth.

The command runs the hook for every **enabled** module. Disabled modules are skipped rather
than failed, so switching one off does not turn its cron entry into a recurring error; one
module's failure does not stop the next one's sweep; and a run with any failure exits
non-zero so cron's own reporting fires.

Implementations must be **idempotent and safe to run concurrently** — cron overlaps are
normal. Guard each step with a conditional UPDATE rather than a read-then-write. Return a
`Record<string, number>` summary; the command prints the non-zero entries.

The e-commerce module is the worked example — see
[ecommerce.md](../../modules/ecommerce/README.md#maintenance-sweeps--required-not-optional).

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
- **Tailwind** `inertia/css/app.css` imports `modules.generated.css`, which holds **one
  `@source` per module** and is written by `scripts/generate-module-sources.mjs` from the
  `prebuild` / `predev` / `preserve` / `pretest` hooks (so an install's rebuild picks up the new
  package automatically — `npm run release` runs `npm run build`, which runs `prebuild`).

  > `@source "../../modules"` does **not** work, and fails silently. Tailwind skips gitignored
  > paths for a directory source _and_ for a broad glob, but honours a path naming the ignored
  > directory itself. Installed marketplace packages are gitignored by design, and a module
  > whose UI is not scanned keeps ~95% of its styling — only classes no other file in the
  > project happens to use disappear. That is how `pl-12` vanished from the ecommerce money
  > input and left the currency symbol rendering underneath the value.

  **Vite alias** `@modules`. **tsconfig**: root excludes `modules/**/ui/**`;
  `modules/tsconfig.json` is in the `typecheck` script. Module UI imports `~/components/*`,
  `~/lib/*`, `~/hooks/*` freely.

- **Sidebar** `inertia/components/admin/sidebar.tsx`: `useModulesMenu()` →
  `/api/admin/modules/menu`, rendered under an **"Apps"** section (collapsible parent or flat
  link), permission-filtered client-side via `useAbility()`. Icons resolved by name via
  `inertia/lib/phosphor-icon.tsx` (`phosphorIconByName`, curated map → `PHOSPHOR_ICON_NAMES`).
- **Hook** `inertia/hooks/api/use-modules.ts`: `useModulesMenu`, `useModulesList`,
  `useToggleModule`.

## Settings → General (`/admin/settings/general`)

`inertia/pages/admin/settings/general.tsx`, `settings:manage`:

- **Public site** — landing on/off (dashboard-only SAAS). Off → `PublicController.home`/`post`
  redirect to dashboard/login. Plus public sign-up on/off.
- **Dashboard management** — hide core sidebar menus. Hidden menus' **pages return 404** (not
  just hidden): `app/middleware/nav_enabled_middleware.ts` maps page prefixes → nav title and
  throws 404, rendered as the in-dashboard 404 page (see below).

State lives in `web_settings` section `app_config` (`landing_enabled`, `registration_enabled`,
`hidden_nav` CSV), read by `WebSettingsService.getAppConfig()` and exposed to the sidebar via
`GET /api/admin/nav-config`. `applyPatches` resets to default (drops the override row) when a
value is empty.

> `nav_enabled_middleware`'s `PATH_NAV` has no `/admin/settings` prefix, so this page can never
> be hidden by `hidden_nav`. That is load-bearing rather than incidental — the page that controls
> which menus exist must not be reachable only through a menu it can switch off.

## Settings → Modules (`/admin/settings/application`)

`inertia/pages/admin/settings/application.tsx`, `settings:manage`. The URL still says
`application`; the page and its breadcrumb say Modules.

- **Apps | Plugins tabs**, split on `ModuleDto.kind`, with the active tab in `?tab=` via
  `useUrlState()`. `apps` is the default and is dropped from the URL.
- Each tab renders `~/components/admin/modules-table.tsx` — the shared `DataTable` with
  `hideSyncColumn` (modules take no part in the offline sync engine) and
  `enableBulkSelect={false}` (there is no bulk operation: install is single-flight, uninstall
  demands typing the name, and enabling is order-sensitive because of `requires`).
- The **Switch is disabled when `schemaReady` is false.** A module with no tables cannot be
  switched on, so the control says so rather than accepting the click and then explaining itself
  with an error. The "Setup required" badge and the Install row action carry the message.
- Row actions are permission-gated: Install behind `module:install`, Uninstall behind
  `module:uninstall`. ADMIN holds the first and not the second.
- **Found on disk** — a callout _above_ the tabs listing folders in `modules/` this server never
  imported. Above rather than inside a tab because an unloaded module has no `kind`; reading it
  would mean importing an unknown manifest into the live process.

`kind` reaches the client through `ModulesService.list()`, taken from the **manifest**
(`m.kind ?? 'app'`) rather than the DB row — same rule as `label` and `version`. The client
mirror in `inertia/types/api.ts` is hand-duplicated and must change with it.

## In-dashboard 404

`inertia/pages/admin/not_found.tsx` (illustration + "Back to dashboard"), rendered inside
`AdminLayout`. The exception handler (`app/exceptions/handler.ts`) renders it for **any** 404 on
an `/admin/*` path (hidden menus + genuinely missing routes); public 404s still use
`errors/not_found`. Middleware short-circuits by **throwing** a 404 (a middleware that returns an
inertia render is not flushed to the response).

## Installing a module from the admin

Installing a module from Settings → Modules applies its migrations for you — no terminal.

### The constraint that shapes this

Lucid's migrator **cannot be scoped to one directory**. `MigratorOptions` has only
`direction`, `connectionName`, `schemaPath`, `dryRun` and `disableLocks`;
`MigrationSource.getMigrationsPaths()` reads `config.migrations.paths` wholesale, and that
array is fixed at config load. **One `run()` applies every pending migration across core,
all plugins and all modules.**

We accept that rather than fight it. A bespoke per-module DDL runner with its own
bookkeeping would leave module tables invisible to `adonis_schema`, giving the project two
parallel migration systems where `node ace migration:run` no longer knows the whole truth.
Instead the confirmation dialog lists exactly what will run, grouped Core / Plugin / Module,
so applying an unrelated pending core migration is a visible decision rather than a surprise.

### Flow

1. `ModuleDto.schemaReady` is false when any table in the manifest's `tables` is missing;
   the row shows a **Setup required** badge.
2. Flipping the toggle on opens the install dialog (`GET /api/admin/schema/pending`).
3. `POST /api/admin/schema/install` runs the migrations.
4. **Migrate first, enable second.** A failed migration leaves the module disabled, which is
   the safe state. The other order leaves it enabled with no tables — the silent failure this
   whole feature exists to remove.

### Guards

Each of these maps to a real sharp edge in Lucid's runner
([`app/services/schema_installer_service.ts`](../../app/services/schema_installer_service.ts)):

| Hazard                                                                                                                                                                                                                                                                                             | Guard                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrator.close()` calls `db.manager.closeAll(true)`, deregistering every connection — every later query throws `E_UNMANAGED_DB_CONNECTION` until restart                                                                                                                                          | Never called. The ace command gets away with it only because the process is exiting. There is a regression test                                                                                 |
| The built-in advisory lock uses hardcoded key `1` taken from an arbitrary pooled connection, but PG advisory locks are session-scoped — acquire on one socket, release on another, and the release fails while leaking the lock. It is also re-entrant, so two runners in one process both proceed | Our own `pg_try_advisory_xact_lock(1)` inside a transaction (which pins the connection); runner gets `disableLocks: true`. Key `1` is deliberate — the CLI and this endpoint exclude each other |
| SQLite has no advisory locks at all                                                                                                                                                                                                                                                                | DB lock skipped; the in-process single-flight guard still applies                                                                                                                               |
| `run()` swallows migration failures into `migrator.error`, but `shutdown()` sits outside its try/catch and can still throw                                                                                                                                                                         | Check `error` and `status` after awaiting, and wrap the call                                                                                                                                    |
| Zero rows in `adonis_schema` plus a schema dump makes `prepareDatabaseForUp()` **drop the migration tables**                                                                                                                                                                                       | Refuse to run when `adonis_schema` is empty — that is a CLI job on a fresh database                                                                                                             |
| `config/database.ts` resolves paths against the process CWD while `MigrationSource` uses `app.appRoot`; when they differ the path list is empty and `run()` succeeds having done nothing                                                                                                           | `expectOwner` requires a pending migration for the named module, checked _before_ the empty-list shortcut                                                                                       |
| `reconcile()` would auto-enable a new module at boot on every process                                                                                                                                                                                                                              | DDL never runs from boot. Modules that own tables set `autoEnable: false`                                                                                                                       |

`module:install` and `module:uninstall` are separate permissions from `settings:manage`
(which every seeded ADMIN holds) and are granted to no role by default.

### Uninstall

`migration:rollback` is unusable here — its only scoping is `batch`/`step` over reverse
insertion order across _all_ paths, so rolling back a module would take unrelated core
migrations with it. Uninstall instead drops the manifest's declared `tables` in reverse
order and deletes that module's `adonis_schema` rows so it can be reinstalled. Removing
those rows is the one place this codebase touches Lucid's bookkeeping, and it is required:
tables gone but records left means reinstall is impossible.

Guarded by the `module:uninstall` permission, a typed confirmation, and the module's own
`canUninstall()` veto — the e-commerce module refuses while any order has payment history.

**Disable never drops anything.** It flips a boolean; all data survives.

## Add a module

```bash
node ace make:module project-management --label="Project Management" --icon=Kanban
```

Scaffolds `modules/project-management/` (manifest, routes, controller, admin page). **There is no
registry to edit** — the folder is found because it holds a `module.ts` whose `name` matches it.
Add your models/migrations/services and restart dev (a fresh module folder needs a build to bundle
its UI, since Vite resolves the globs above at build time). After migrating,
`modules_provider` reconciles the row + mints the permissions on boot — grant them to a role
(superadmin holds all).

## Related

- [frontend.md](./frontend.md) · [auth-and-permissions.md](./auth-and-permissions.md)
