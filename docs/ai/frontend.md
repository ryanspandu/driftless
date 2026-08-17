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
| `filters` | Filter controls — `TableFilterTabs` for a status/segment filter, `AppSelect` for a long list — rendered beside the search box |
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
  filters={<TableFilterTabs value={status} onChange={setStatus} options={statusOptions} />}
  urlSync={{ paramPrefix: 'all' }}
  emptyMessage="No results."
/>
```

## Filters and tabs

There is **one** tab look in the admin, and it comes from the design system. Two components, and
the choice between them is mechanical:

| Situation | Use |
|---|---|
| Switching which panel of a page you are looking at | `Tabs` / `TabsList` / `TabsTrigger` (`~/components/ui/tabs`) |
| A status/segment filter in a `DataTable` toolbar, usually with counts | `TableFilterTabs` (`~/components/admin/table-filter-tabs`) |
| More than a handful of options, or they need searching | `AppSelect` (`~/components/ui/app-select`) |

**Never hand-roll either one.** `TabsList` already *is* the segmented control —
`inline-flex rounded-lg bg-muted p-1`, active `bg-background shadow-sm` — and `TableFilterTabs`
renders `Tabs` underneath, adding only the count, an optional leading icon, and an optional
`title` hint.

```tsx
<TableFilterTabs
  value={tab}
  options={[
    { value: 'all', label: 'All', count: rows.length },
    { value: 'published', label: 'Published', count: published.length },
  ]}
  onChange={onTabChange}
/>
```

Do not pass a `className` to `TabsList`. An override is what made one page's tabs stretch
full-width while every other page's sat inline, and it is the only reason they ever looked
different.

**Why this rule is written this way.** The previous version of this doc told you to build the
control from its classes (`bg-muted p-1`, active `bg-background shadow-sm`) rather than naming a
component. Twelve screens across core and the modules each grew their own copy of that markup, so
a change to the look meant twelve edits — and a thirteenth was added by an agent that "extracted"
the duplicate into a *second* component rather than noticing `Tabs` already existed, colliding
with the unrelated `SegmentedControl` in `inertia/puck/style-controls.tsx`. Name components, not
class strings.

> `inertia/puck/style-controls.tsx` also exports a `SegmentedControl`. That one belongs to the
> page builder's Element panel — a different context with a different density. Do not reach for it
> from an admin page, and do not confuse the two.

## Admin list-page design pattern

Every admin list/table page follows one pattern (`inertia/pages/admin/content.tsx` is canonical):

- **`<PageHeader title subtitle? count? actions? />`** (`~/components/admin/page-header`) is the
  page's only `<h1>` — title + muted count chip + subtitle + right-aligned actions. The top bar
  shows a **breadcrumb** (`Admin › X`), not a duplicate title.
- **No `<Card>` wrapper** around a `DataTable` — the table renders directly (it has its own
  elevated `bg-card` surface, toolbar, and pagination).
- **Status/category filter → `<TableFilterTabs>`** in the DataTable `filters` slot, not big tabs
  above the table. See [Filters and tabs](#filters-and-tabs) — do **not** hand-roll the buttons.
- **Primary cell**: stacked `flex flex-col leading-tight` with `font-medium` primary +
  `text-xs text-muted-foreground` secondary (e.g. title + slug).
- **Tinted status badges**: `~/components/ui/badge` has `success` (green) / `warning` (amber)
  in addition to default/secondary/destructive/outline.
- **Density is global** in `~/components/ui/table.tsx`: body `text-[13px]`, header cells
  `text-[13px]`, `py-2.5`; date/secondary cells `text-xs text-muted-foreground tabular-nums`.
  The DataTable search box is filled (`bg-muted/60`).

## Sidebar

`inertia/components/admin/sidebar.tsx`: Phosphor icons, **active-only duotone** (active row gets
`weight="duotone"` + brand-tinted bg + a left accent bar via the `--sidebar-active*` tokens in
`app.css`). Sections: core nav → **Apps** (enabled [modules](./modules.md)) → dynamic Collections
→ a user chip footer. Core nav entries are hidden when their title is in `hidden_nav` (read from
`/api/admin/nav-config`); see [modules.md](./modules.md) for the Settings → General toggles and
the in-dashboard 404 (`admin/not_found`).

**Three lists must agree**, all keyed on the same title strings: `navEntries` here,
`HIDEABLE_NAV` in `inertia/pages/admin/settings/general.tsx`, and `PATH_NAV` in
`app/middleware/nav_enabled_middleware.ts`. A title in `HIDEABLE_NAV` but missing from the other
two is a toggle that does nothing; a *path prefix* in `PATH_NAV` whose page is reachable from
somewhere other than the sidebar is a 404 waiting for whoever follows that other route. That
second case is why **Integrations is in none of them** — it is a Settings hub card, not a menu.

## Theme scoping (important)

Dark/light mode (`next-themes`, `.dark` on `<html>`) affects **only the dashboard and auth** —
NOT the public/FE site. The public shell is forced light:

- The dark variant is `@custom-variant dark (&:is(.dark *):not(.theme-light *))`, and light vars
  live on `:root, .theme-light`. `.theme-light` **also re-sets `color`/`background-color`**
  (inherited `color` from `<body>` would otherwise leak white text into un-coloured headings).
- FE roots carry `.theme-light` (`PublicLayout`, and the `public/page*` wrappers in
  `layout-shell.tsx`). `PublicLayout` additionally strips `.dark` from `<html>` while mounted (a
  `MutationObserver`, restored via `useTheme().resolvedTheme`).
- **When adding a public/FE page:** route it through `PublicLayout` or wrap its root in
  `.theme-light`; never wrap admin/auth pages in it.

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
