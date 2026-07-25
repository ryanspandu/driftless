# Driftless — User guide

A practical guide to running the Driftless admin dashboard. For developer/architecture docs see
[docs/ai/](./ai/).

## The dashboard

Sign in at `/login`; you land on the **Overview** (`/admin/dashboard`) — content stats and a
"Recent content" table. The left **sidebar** is your main navigation; the top bar shows a
breadcrumb plus sync status, the theme toggle, and your account menu. Collapse the sidebar with
the toggle next to the logo.

Sidebar sections, top to bottom:

1. **Core menus** — Dashboard, Analytics, UI (Content / Pages / Templates), Media, Collections,
   Plugins, Integrations, User Management, Settings.
2. **Apps** — enabled [modules](#modules) (e.g. Tasks).
3. **Collections** — your dynamic CMS collections.
4. **Plugins** — enabled plugins' pages.
5. **Account** — your name/role + sign out.

## Light / dark mode

Use the theme toggle (top bar) to switch the dashboard between light and dark. This affects
**only the dashboard and the login/register pages** — your public website (landing page, posts)
always stays light, regardless of the toggle.

## Settings → Application

`Settings → Application` (needs the *Settings: manage* permission) is where you tailor the app to
how you work. Three groups:

### Public site

Toggle **Landing page & public pages** off to run Driftless as a **dashboard-only app** (SAAS
mode): the public landing and posts redirect visitors to the dashboard / login, so only the admin
exists.

### Dashboard management

Hide core sidebar menus you don't use (e.g. turn off **Analytics** if you never look at it).
Dashboard and Settings can't be hidden. When a menu is hidden it's removed from the sidebar **and
its pages return a 404** — so a hidden area is genuinely turned off, not just visually tucked
away. Turn it back on and it reappears instantly.

### Modules

Enable or disable each installed [module](#modules). Disabling one removes its sidebar group and
turns off its pages.

## Modules

**Modules** are self-contained feature areas built into the product (think of a task tracker,
project management, a CRM). They appear under the **Apps** group in the sidebar when enabled, and
are managed from *Settings → Application → Modules*.

The bundled example is **Tasks** (`/admin/tasks`) — a lightweight task tracker with status (To
do / In progress / Done), priority, and due dates, using the same clean table layout as the rest
of the dashboard. It's a starting point you can grow into full project management.

Modules differ from **plugins** (managed at `/admin/plugins`): plugins are optional/third-party
add-ons; modules are first-party parts of *your* product. Developers add a new module with one
command — see [docs/ai/modules.md](./ai/modules.md).

## Content & CMS

- **Content** (UI → Content) manages posts/pages/media entries with status filters and search.
- **Collections** lets you model any content type with custom fields (no migrations). Each
  collection gets its own sidebar entry and records table. Fields cover text, rich text, number /
  integer / decimal, email, password, boolean, date/time, select, media, slug and JSON. A
  collection can be a **Single type** (exactly one entry — e.g. a homepage or global settings)
  instead of a list.
- **Relations** link entries across collections — one-to-one, many-to-one, many-to-many, or
  one-to-many — and you pick the related entries right in the record editor.
- **Components** are reusable groups of fields (e.g. an "SEO" group): build one under
  **Collections → Components**, then attach it to any collection as a single group or a repeatable
  list. You can also define a group inline on a single field.
- In a collection's **Fields** tab, drag to reorder and set each field's **width** (full / half /
  third) to lay fields out side-by-side — the same layout is used when editing records.
- **Pages / Templates** is the visual page builder (layouts, headers, footers, components). In the
  builder, the **gear** opens *Page settings* — page SEO/meta tags and per-page custom CSS/JS that
  runs only on that page.
- **Website settings** (UI → Website settings) sets your site title, favicon, site-wide meta tags,
  and global custom CSS/JS applied across your published pages.
- Tables everywhere share the same toolbar (search + filters), tinted status badges, and
  pagination, so every list page feels identical.

## Offline editing

If offline mode is enabled, you can keep editing Content and CMS records when the network drops —
changes queue locally (the sync indicator in the top bar shows pending/synced) and sync
automatically when you reconnect. Creating an item and editing it before it syncs is handled
safely (no stuck "conflict").

## Users, roles & permissions

**User Management** covers Users, Roles, and Permissions. Access to each area and action is
governed by permissions assigned to roles; if you can't see a menu or get a 404 / "no
permission", your role likely lacks that permission. A superadmin holds everything.

## Related

- [Developer / AI docs](./ai/) — architecture, modules, CMS, offline, plugins.
