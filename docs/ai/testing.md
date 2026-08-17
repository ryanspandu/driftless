# Testing

Tests use **Japa** with Adonis plugins. Config in `adonisrc.ts` and `tests/bootstrap.ts`.

## Run

```bash
npm test
# or
node ace test
```

## Suites

Six, all registered in `adonisrc.ts`.

| Suite | Glob | Timeout | Status | Use for |
|-------|------|---------|--------|---------|
| `unit` | `tests/unit/**/*.spec.ts` | 2s | active | Pure logic, small units |
| `functional` | `tests/functional/**/*.spec.ts` | 30s | active | HTTP/API, database |
| `client` | `inertia/**/*.spec.{ts,tsx}` | 5s | active | Front-end logic pure enough to run under Node |
| `modules` | `modules/*/tests/**/*.spec.ts` | 30s | active | A module's own tests, shipped with its folder |
| `pg` | `tests/pg/**/*.spec.ts` | 60s | active, opt-in | Postgres-only behaviour (advisory locks). Gated on `PG_TEST_URL`; run with `node ace test pg` |
| `browser` | `tests/browser/**/*.spec.ts` | 5 min | configured, no tests yet | End-to-end UI (Playwright via `@japa/browser-client`) |

Two are easy to miss, and both bite:

- **`client` specs live beside the code**, not in `tests/`. The root `tsconfig.json` excludes
  `inertia/**`, so a spec under `tests/` importing from there fails the project-references
  typecheck.
- **`modules` specs live in `modules/<name>/tests/`**, because a module is meant to be a folder
  you can drop in. `node ace test functional` does **not** run them — see the warning below.

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

### Run the whole suite before claiming green

`node ace test` runs everything. `node ace test functional` runs one suite of six, and the module
tests are **not** in it.

This is not hypothetical: three e-commerce tests sat broken while `functional` reported all green,
because `staticbloom_home_seeder` had started creating a page and nothing in the functional suite
noticed. Verifying with one suite and reporting "tests pass" is how that survived.

```bash
node ace test              # all six — this is what "green" means
node ace test functional   # one suite; fine while iterating, not for a verdict
```

### Never assert a global row count

`testUtils.db().seed()` runs **every** seeder, and seeders get added. An assertion like:

```ts
assert.lengthOf(await Page.all(), 2)   // ✗ breaks when any seeder creates a page
```

couples your test to code it has nothing to do with — and it broke exactly that way twice, first
when `staticbloom_home_seeder` landed and again when `auth_pages_seeder` did. Count what your
subject owns:

```ts
const STOREFRONT_PATHS = ['shop-front', 'shop-product']
assert.equal((await Page.query().whereIn('path', STOREFRONT_PATHS)).length, 2)   // ✓
```

The same applies to any `Model.all()` in an assertion. Ask what the test *means* — usually "my
thing created N rows", not "the database has N rows".

### Do not lean on a module being enabled

`ecommerce` ships `autoEnable: false`, so it never boots in the test environment and its mail
events, block resolvers and routes are absent. A test that needs a registered thing should
register its own fixture rather than borrowing a module's — see
`tests/functional/mail_events.spec.ts`, which declares `testfixture.toggleable` for this reason.
Registries are process-global and refuse duplicate keys, so register once in `group.setup`, not
`group.each.setup`.

## Example

`tests/functional/mail_events.spec.ts` is the fullest one — a registry fixture, scoped
assertions, and both service-level and HTTP-level coverage in one group.
`tests/functional/migration.spec.ts` is the smallest.

## Related

- [dev-workflow.md](./dev-workflow.md)
- [backend.md](./backend.md)
