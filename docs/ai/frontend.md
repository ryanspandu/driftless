# Frontend

React 19 SPA delivered via **Inertia.js**, built with **Vite 7** and **Tailwind CSS 4**.

## Entry and boot

- `inertia/app.tsx` — `createInertiaApp`, providers (theme, React Query, delete confirm, Tuyau).
- CSS: `inertia/css/app.css`.
- Page glob: `import.meta.glob('./pages/**/*.tsx')`.

## Pages and layouts

| Path | Maps to |
|------|---------|
| `inertia/pages/admin/dashboard.tsx` | Inertia name `admin/dashboard` |
| `inertia/pages/auth/login.tsx` | `auth/login` |
| `inertia/pages/errors/not_found.tsx` | Error pages |

Layouts (`inertia/layouts/`):

- `admin.tsx` — back office shell + sidebar
- `auth.tsx` — login/signup
- `public.tsx` — marketing/public site
- `default.tsx` — fallback

`LayoutShell` in `inertia/components/layout-shell.tsx` picks layout from page metadata.

## Data fetching

Two patterns:

1. **Inertia props** — server passes data on first render (`renderPage` in controller).
2. **React Query** — `inertia/hooks/api/*` hooks call `/api/admin/*` via `~/lib/api-client.ts`.

Prefer hooks for CRUD tables and mutations; use Inertia props for page shell data when already loaded server-side.

## UI components

- Shadcn-style primitives under `inertia/components/ui/` (Button, Dialog, Table, etc.).
- **Button**: `@base-ui/react/button` + CVA in `button.tsx`. Use `render={<Link href="..." />}` for link-styled buttons (`nativeButton` defaults to `false` for non-button renders).
- Icons: `lucide-react`, `react-icons`.
- Rich text: TipTap in `inertia/components/cms/rich-text-editor.tsx`.

## Client libraries

| Path | Purpose |
|------|---------|
| `~/lib/api-client.ts` | Authenticated admin API |
| `~/lib/api-public.ts` | Public endpoints |
| `~/lib/permissions.ts`, `~/lib/ability.ts` | Client-side permission checks |
| `~/lib/cms/client.ts` | CMS-specific helpers |
| `~/hooks/use-inertia-url.ts` | URL state with Inertia |
| `~/hooks/use-data-table-url-sync.ts` | Table pagination/sort in URL |

## Types and routes

- Tuyau client: `inertia/client` (generated).
- Do not hand-edit `.adonisjs/client/`.

## Adding an admin page

1. Create `inertia/pages/admin/my_feature.tsx` (default export React component).
2. Controller: `renderPage(inertia, 'admin/my_feature', { ... })`.
3. Route: `GET /admin/my-feature` in `start/routes.ts`.
4. Optional: `inertia/hooks/api/use-my-feature.ts` + `/api/admin/...` routes.
5. Gate UI with `permissions` from shared props or `~/lib/ability`.

## Styling

- Tailwind v4 with `@import "tailwindcss"` in `app.css`.
- Theme: `next-themes` + CSS variables for light/dark.
- Use `cn()` from `~/lib/utils` for class merging.

## Related

- [architecture.md](./architecture.md)
- [offline-and-pwa.md](./offline-and-pwa.md)
- [cms.md](./cms.md)
