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
| **Operators (self-hosting)** | [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) — including [email setup](docs/SELF_HOSTING.md#setting-up-email) |
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

## Modules

A **module** is a first-party feature area — back-end *and* front-end — in a single folder under `modules/<name>/`. Same packaging as a plugin, but for core parts of *your* product; enabled modules get a first-class **Apps** group in the sidebar.

- **Apps and plugins are one system.** `kind` on the manifest is the only difference: an *app* is a first-party part of your product, a *plugin* is a narrower third-party add-on. There is no separate `plugins/` directory.
- **Manage them** at **Settings → Modules** (`/admin/settings/application`): install, enable/disable (DB-backed, no restart) and remove each one, with **Apps** and **Plugins** on separate tabs. Folders dropped into `modules/` that the running server has not loaded yet appear above the tabs with an Install button.
- **Settings → General** (`/admin/settings/general`) turns the public site on/off (dashboard-only SAAS mode), controls public sign-up, and hides core sidebar menus (hidden menus' pages return a clean in-dashboard 404).
- **Examples:** **Tasks** ([`modules/tasks/`](modules/tasks)) at `/admin/tasks`, and **Announcements** ([`modules/announcements/`](modules/announcements)) at `/admin/announcements`.
- **Add one:** `node ace make:module <name>`, run migrations, and `npm run build` once. **Nothing to register** — a folder is found because it holds a `module.ts` whose `name` matches it, which is what lets an installer add one by copying a directory. Full guide: [docs/ai/modules.md](docs/ai/modules.md).

## License

UNLICENSED — private project.
