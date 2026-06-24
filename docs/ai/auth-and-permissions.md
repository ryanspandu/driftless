# Auth and permissions

## Authentication

- **Guard**: session-based `web` guard (`config/auth.ts`).
- **Provider**: `sessionUserProvider` with `app/models/user.ts`.
- **API tokens**: a second `api` guard (`tokensGuard`, `@adonisjs/auth/access_tokens`) for the external `/api/v1` — opaque Personal Access Tokens (`auth_access_tokens` table, `withAccessTokens` on User), minted/revoked at `/admin/integrations/api-tokens` (**self-service** — each user manages their own, no extra permission). Effective access = user RBAC ∩ token abilities. See [api-v1.md](./api-v1.md).
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

Builtin permission codes are seeded from `database/seeder_constants.ts`: `*`, `content:create|read|update|delete`, `user:read|manage`, `media:read|manage`, `cms:manage`, `page:*`, `template:*`, `role:manage`, `permission:manage`, `settings:manage`, `plugin:manage`. **There are no native CMS collections** — Content, Media and Users are standalone resources (dedicated pages + the permissions above), not CMS collections. `cms:{key}:*` codes only exist for dynamic collections.

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

- Web settings and integration keys: `settings_controller`, encrypted fields via `SETTINGS_ENCRYPTION_KEY`.
- Admin UI: `inertia/pages/admin/settings.tsx`, `integrations/*`.

## Related

- [backend.md](./backend.md)
- [architecture.md](./architecture.md)
