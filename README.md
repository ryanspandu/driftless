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
# Set APP_KEY: node ace generate:key
node ace migration:run
node ace db:seed
npm install
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

## License

UNLICENSED — private project.
