# Auth and permissions

## Authentication

- **Guard**: session-based `web` guard (`config/auth.ts`).
- **Provider**: `sessionUserProvider` with `app/models/user.ts`.
- **API tokens**: a second `api` guard (`tokensGuard`, `@adonisjs/auth/access_tokens`) for the external `/api/v1` — opaque Personal Access Tokens (`auth_access_tokens` table, `withAccessTokens` on User), minted/revoked at `/admin/settings/api-tokens` (**self-service** — each user manages their own, no extra permission). Effective access = user RBAC ∩ token abilities. See [api-v1.md](./api-v1.md).
- **Routes**: `/login`, `/register`, `/logout`, `/api/me` in `start/routes.ts`. `/signup`, `/auth/signup`, `/auth/register` are legacy redirect aliases to `/register`.
- **Google OAuth**: `google_auth_controller` — `/auth/google`, callback, status.
- **CAPTCHA**: Configurable via integration settings + env; used on auth forms when enabled.

Middleware:

- `guest` — register/login routes only
- `auth` — requires authenticated user (admin area)

## Authorization (RBAC)

Users have **roles**; roles have **permissions** (string names). Permissions are shared with the frontend via Inertia (`permissions` in `inertia_middleware.ts`).

### Permission grammar

From `app/services/permission_ability_service.ts`:

| Pattern | Meaning |
|---------|---------|
| `*` | Full access |
| `cms:manage` | Collection/field schema + broad CMS admin |
| `cms:{key}:{verb}` | Record access for one collection (`read`, `create`, `update`, `delete`) |
| `{resource}:{action}` | Static resources (`content:read`, `user:manage`, `media:manage`, `settings:manage`, …) |

`abilityAllowsCode(permissionNames, code)` checks if a user may perform an action.

Builtin permission codes are seeded from `database/seeder_constants.ts`: `*`, `content:create|read|update|delete`, `user:read|manage`, `media:read|manage`, `cms:manage`, `page:*`, `template:*`, `role:manage`, `permission:manage`, `settings:manage`, `module:manage`, `module:install`, `module:uninstall`. **There are no native CMS collections** — Content, Media and Users are standalone resources (dedicated pages + the permissions above), not CMS collections. `cms:{key}:*` codes only exist for dynamic collections.

#### Module permissions — read this before changing them

| Code | Held by | Guards |
|---|---|---|
| `module:manage` | ADMIN | **Nothing.** See below |
| `module:install` | ADMIN, SUPERADMIN | Install a module, apply migrations — runs a build on the server and restarts the process |
| `module:uninstall` | SUPERADMIN only | Drops a module's tables. No undo |

**`module:manage` is seeded, granted to ADMIN, and enforced on no route.** The module
enable/disable endpoints use `settings:manage` instead (`start/routes.ts`). It is a
"we thought this was protected" gap rather than a live vulnerability — `settings:manage` is
held by the same role — but anyone reading the seeder would reasonably conclude the toggle is
behind `module:manage`, and it is not. Fixing it means a migration plus a grant change, so it
has been left alone deliberately rather than half-done.

`module:install` was granted to ADMIN as a product decision, knowing that it makes a
compromised admin account able to run a build on the box. The compensating controls are
load-bearing, not decoration: a 3-per-hour per-user throttle (`moduleInstallThrottle`), an
audit row written before any work begins, and a module name resolved through the on-disk
allow-list before it can reach a subprocess.

### Route middleware

`require_permission_middleware` resolves required code from options:

```typescript
// Explicit
.use(middleware.permission({ permission: 'role:manage' }))

// Resource + HTTP verb — `resource` accepts only 'content' | 'user' | 'media'
.use(middleware.permission({ resource: 'user' }))     // read → user:read, write → user:manage
.use(middleware.permission({ resource: 'content' }))  // → content:{verb}
.use(middleware.permission({ resource: 'media' }))    // read → media:read, write → media:manage

// CMS records (uses :key param + method) — only for dynamic collections
.use(middleware.permission({ cmsRecord: true }))  // → cms:{collectionKey}:read, etc.
```

For any other code (e.g. `settings:manage`, `role:manage`) use the explicit
`{ permission: '...' }` form — `resource` does not cover them.

### Client-side checks

- Shared prop: `permissions: string[]`
- Helpers: `inertia/lib/permissions.ts`, `inertia/lib/ability.ts`
- Hide/disable UI when user lacks codes; server must still enforce middleware.

## Settings and integrations

- Web settings and integration keys: `settings_controller`. Secrets live in `*_enc`
  columns on `integration_settings`, encrypted with the app encrypter
  (`config/encryption.ts`: AES-256-GCM keyed on `APP_KEY`) and masked on read.
  `web_settings.value` is plaintext — never store a secret there.
- Rotating `APP_KEY`: set the outgoing key as `APP_KEY_PREVIOUS` so stored
  ciphertext stays readable, re-save each secret, then drop the old key.
- Admin UI: `inertia/pages/admin/settings.tsx`, `integrations/*`.

## Related

- [backend.md](./backend.md)
- [architecture.md](./architecture.md)
