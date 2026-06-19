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
| **AI assistants** | [AGENTS.md](AGENTS.md) → [docs/ai/](docs/ai/) |
| **Migration from legacy stack** | [docs/LEGACY_MIGRATION.md](docs/LEGACY_MIGRATION.md) |

## Project layout

```
app/           Adonis controllers, services, models
inertia/       React + Inertia frontend
database/      Migrations and seeders
start/         Routes and HTTP kernel
config/        Application configuration
tests/         Japa test suites
```

## UI conventions

Every admin table is built from a single shared component (`inertia/components/data-table.tsx`), so tables look and behave the same on every page:

- **Search** box top-left, aligned with the **"Last synced"** indicator on the right; any **filters** sit beside the search box.
- **Footer** always has three zones: **Rows per page** (default 10) on the left, **pagination** in the center, and **Go to page** on the right.

When adding a page with tabular data, reuse this `DataTable` component rather than writing a new table. Details: [docs/ai/frontend.md](docs/ai/frontend.md#data-tables).

## License

UNLICENSED — private project.
