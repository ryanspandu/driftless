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

## Data tables

**Always use the shared `DataTable` for any tabular data.** Never build a raw `<table>`, a bespoke list-styled-as-table, or a second table abstraction. One component keeps every table on every page identical (toolbar, search, filters, pagination). There is exactly one table component — if you find a raw `<table>` or another table wrapper, migrate it to `DataTable`.

Files:

- `~/components/data-table` — `DataTable`, `DataTableColumnHeader`
- `~/components/data-table-pagination` — `DataTablePagination` (rendered automatically by `DataTable`)
- `~/components/ui/table` — low-level primitives (`Table`, `TableRow`, …) used **inside** `DataTable`, not directly in pages

### Uniform layout

- **Toolbar (top):** search box top-left, aligned with **"Last synced"** on the top-right. Extra filters go to the **right of the search box** via the `filters` prop — do not add a separate filter bar elsewhere.
- **Footer (bottom):** always three zones — **Rows per page** (left, default 10), **pagination** (center), **Go to page** (right). All three render even with a single page (controls just disable).
- Sortable headers via `DataTableColumnHeader`.

### Search modes

- **Client-side (default):** omit `searchValue`/`onSearchChange`; `DataTable` filters the rows it is given. Use for fully-loaded datasets (roles, permissions, collections).
- **Server-side (controlled):** pass `searchValue={state}` + `onSearchChange={setState}` and feed the state into your API query; combine with `serverPagination` when the API returns one page at a time (users, cms records). The built-in client filter is bypassed automatically.

### Key props

| Prop | Purpose |
|------|---------|
| `columns`, `data` | TanStack `ColumnDef[]` + rows |
| `getRowId` | Stable row id (defaults to `row.id`) |
| `searchPlaceholder` | Search input placeholder |
| `searchValue` / `onSearchChange` | Controlled (server-side) search |
| `filters` | Filter controls (e.g. `AppSelect`) rendered beside the search box |
| `urlSync={{ paramPrefix? }}` | Reflect search/sort/page in the URL |
| `serverPagination={{…}}` | API-driven pagination |
| `getSyncStatus` / `lastSyncedAt` / `hideSyncColumn` | Offline sync column + "Last synced" label |
| `emptyMessage` | Empty-state text |

### Example

```tsx
<DataTable
  columns={columns}
  data={rows}
  getRowId={(r) => r.id}
  searchPlaceholder="Search by title or slug…"
  filters={<AppSelect value={status} onChange={setStatus} options={statusOptions} />}
  urlSync={{ paramPrefix: 'all' }}
  emptyMessage="No results."
/>
```

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

- Tuyau client: `inertia/client.ts` (hand-written; imports from `@generated/registry`).
- Generated code lives in `.adonisjs/client/` (alias `@generated`) — do not hand-edit it.

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
