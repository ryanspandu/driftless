# Auth and permissions

## Authentication

- **Guard**: session-based `web` guard (`config/auth.ts`).
- **Provider**: `sessionUserProvider` with `app/models/user.ts`.
- **Routes**: `/login`, `/signup`, `/logout`, `/api/me` in `start/routes.ts`.
- **Google OAuth**: `google_auth_controller` — `/auth/google`, callback, status.
- **CAPTCHA**: Configurable via integration settings + env; used on auth forms when enabled.

Middleware:

- `guest` — signup/login routes only
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
| `{resource}:{action}` | Static resources (`content:read`, `user:manage`, `settings:manage`, …) |

`abilityAllowsCode(permissionNames, code)` checks if a user may perform an action.

### Route middleware

`require_permission_middleware` resolves required code from options:

```typescript
// Explicit
.use(middleware.permission({ permission: 'role:manage' }))

// Resource + HTTP verb
.use(middleware.permission({ resource: 'user' }))  // read → user:read, write → user:manage

// CMS records (uses :key param + method)
.use(middleware.permission({ cmsRecord: true }))  // → cms:posts:read, etc.
```

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
