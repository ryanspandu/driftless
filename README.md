# Driftless

Content management monolith built with **AdonisJS 7** and **Inertia + React**. Includes dynamic CMS collections, RBAC, media library, integrations (Google OAuth, CAPTCHA, analytics), and optional offline/PWA support.

Successor to the legacy split API/frontend apps.

## Requirements

- Node.js **≥ 24**
- PostgreSQL **16** (Docker recommended)

## Quick start

```bash
docker compose up -d
cp .env.example .env
npm install                 # required before any `node ace` command
node ace generate:key       # sets APP_KEY in .env
node ace migration:run
node ace db:seed
npm run dev
```

Open http://localhost:3333 (default). Admin seed credentials are in `.env.example` (`SEED_ADMIN_*`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server with Vite HMR |
| `npm run build` | Production build |
| `npm start` | Run production server |
| `npm test` | Run Japa tests |
| `npm run typecheck` | TypeScript check (server + inertia) |
| `npm run lint` | ESLint |

## Documentation

| Audience | Entry |
|----------|--------|
| **Users / admins** | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) |
| **AI assistants** | [AGENTS.md](AGENTS.md) → [docs/ai/](docs/ai/) |
| **Migration from legacy stack** | [docs/LEGACY_MIGRATION.md](docs/LEGACY_MIGRATION.md) |

## Project layout

```
app/           Adonis controllers, services, models
inertia/       React + Inertia frontend
database/      Migrations and seeders
start/         Routes and HTTP kernel
config/        Application configuration
plugins/       Self-contained plugins (back-end + front-end in one folder)
modules/       First-party app modules (back-end + front-end in one folder)
tests/         Japa test suites
```

## UI conventions

Every admin table is built from a single shared component (`inertia/components/data-table.tsx`), so tables look and behave the same on every page:

- **Search** box top-left, aligned with the **"Last synced"** indicator on the right; any **filters** sit beside the search box.
- **Footer** always has three zones: **Rows per page** (default 10) on the left, **pagination** in the center, and **Go to page** on the right.

When adding a page with tabular data, reuse this `DataTable` component rather than writing a new table. Details: [docs/ai/frontend.md](docs/ai/frontend.md#data-tables).

## Plugins

A **plugin** packages a feature — its back-end *and* front-end — in a single folder under `plugins/<name>/`. A plugin can provide an **admin dashboard** and a **public page** for visitors.

- **Manage them** at **Admin → Plugins** (`/admin/plugins`): each installed plugin has an **Active** toggle. Disabling hides its menu and blocks its routes immediately, without a restart; its data is kept and restored when you re-enable it.
- **Example:** the bundled **Announcements** plugin ([`plugins/announcements/`](plugins/announcements)) — manage entries at `/admin/announcements`, visitors read them at `/announcements`.
- **Add one:** create a folder under `plugins/`, register it in `plugins/registry.ts`, run migrations, and `npm run build` once. Full guide: [docs/ai/plugins.md](docs/ai/plugins.md).

## Modules

A **module** is a first-party feature area — back-end *and* front-end — in a single folder under `modules/<name>/`. Same packaging as a plugin, but for core parts of *your* product; enabled modules get a first-class **Apps** group in the sidebar.

- **Manage them** at **Settings → Application** (`/admin/settings/application`): toggle each module on/off (DB-backed, no restart). The same panel turns the public site on/off (dashboard-only SAAS mode) and hides core sidebar menus (hidden menus' pages return a clean in-dashboard 404).
- **Example:** the bundled **Tasks** module ([`modules/tasks/`](modules/tasks)) — a lightweight task tracker at `/admin/tasks`.
- **Add one:** `node ace make:module <name>`, register it in `modules/registry.ts`, run migrations, and `npm run build` once. Full guide: [docs/ai/modules.md](docs/ai/modules.md).

## License

UNLICENSED — private project.
