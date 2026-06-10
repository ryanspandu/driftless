# Conventions

## General principles

- **Minimal scope** — smallest correct change; avoid drive-by refactors.
- **Match existing patterns** — naming, folder layout, service extraction, UI components.
- **No secrets in git** — never commit `.env`, keys, or credentials.
- **Commits and PRs** — only when the user explicitly asks.

## TypeScript

- Backend and app code: root `tsconfig` (Adonis).
- Frontend: `inertia/tsconfig.json` — run both via `npm run typecheck`.
- Use ESM (`"type": "module"`).

## Import aliases

**Backend** (`package.json` `imports`):

| Alias | Path |
|-------|------|
| `#controllers/*` | `app/controllers/` |
| `#models/*` | `app/models/` |
| `#services/*` | `app/services/` |
| `#middleware/*` | `app/middleware/` |
| `#validators/*` | `app/validators/` |
| `#config/*` | `config/` |
| `#database/*` | `database/` |
| `#cms/*` | `app/cms/` |

**Frontend** (`vite.config.ts`):

| Alias | Path |
|-------|------|
| `~/` | `inertia/` |
| `@generated` | `.adonisjs/client/` |

## Linting and formatting

- ESLint: `eslint.config.js` (`@adonisjs/eslint-config` + React plugins).
- Prettier: `@adonisjs/prettier-config` in `package.json`.

## UI

- Prefer `~/components/ui/button` (`Button`) over raw `<button>` for actions.
- Use Tailwind utility classes; design tokens in `inertia/css/app.css`.
- Base UI primitives under `inertia/components/ui/`.

## Generated code

Do not hand-edit:

- `.adonisjs/client/**`
- `.adonisjs/server/**` (generated controllers registry)

## Documentation maintenance

| Change | Update |
|--------|--------|
| New top-level stack concern | `AGENTS.md` + relevant `docs/ai/*.md` |
| Route or permission model | `auth-and-permissions.md`, `cms.md`, `.cursor/rules/backend.mdc` |
| Dev/command changes | `dev-workflow.md`, `AGENTS.md` |
| Legacy stack migration steps | `docs/LEGACY_MIGRATION.md` only (link from AI docs, do not fork) |

## Related

- [backend.md](./backend.md)
- [frontend.md](./frontend.md)
- [AGENTS.md](../../AGENTS.md)
