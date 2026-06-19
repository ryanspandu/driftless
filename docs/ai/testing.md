# Testing

Tests use **Japa** with Adonis plugins. Config in `adonisrc.ts` and `tests/bootstrap.ts`.

## Run

```bash
npm test
# or
node ace test
```

## Suites

All three suites are registered in `adonisrc.ts`. Only `functional` currently
has tests and a directory; `tests/unit/` and `tests/browser/` are configured but
not yet created — add the directory when you write the first spec for them.

| Suite | Glob | Timeout | Status | Use for |
|-------|------|---------|--------|---------|
| `unit` | `tests/unit/**/*.spec.ts` | 2s | configured, no tests yet | Pure logic, small units |
| `functional` | `tests/functional/**/*.spec.ts` | 30s | active | HTTP/API, database |
| `browser` | `tests/browser/**/*.spec.ts` | 5 min | configured, no tests yet | End-to-end UI (Playwright via `@japa/browser-client`) |

> **Browser suite:** `@japa/browser-client` is a dev dependency, but `playwright`
> is only present transitively. Install it (`npm i -D playwright` + `npx playwright install`)
> before writing browser specs.

## Bootstrap plugins

From `tests/bootstrap.ts`:

- `@japa/assert`
- `@japa/api-client` (base URL from `HOST`/`PORT`)
- `@japa/plugin-adonisjs`
- Lucid `dbAssertions`
- Auth + session API/browser clients
- Shield API client

## Guidelines

- Prefer **functional** tests for routes, permissions, and migrations.
- Use **browser** suite sparingly for critical flows (login, CMS save).
- Migrate test DB per suite as configured in bootstrap hooks.
- Do not depend on production `.env` secrets in tests.

## Example

Existing: `tests/functional/migration.spec.ts`.

## Related

- [dev-workflow.md](./dev-workflow.md)
- [backend.md](./backend.md)
