# Templates — reusable headers, footers, components & layouts

**Status:** COMPLETE (2026-06-21) — T1–T4 shipped. `templates` table (data migrated from the now-removed
page_globals/page_templates); `TemplatesService`; admin CRUD + **Templates** sidebar menu (list by type,
builder reuse at `/admin/templates/:id/edit`, set-default, duplicate); live `TemplateRef` + `PageOutlet`
blocks with recursive resolver (cycle/depth guards); per-page `layout_id`/`header_template_id`/
`footer_template_id` + form selectors; public render composes layout → outlet → refs (SSR/SSG/CSR).
**T4:** SSG snapshots cleared on template update/setDefault/remove (`PagesService.invalidateAllSnapshots`);
delete blocked when a template is referenced (`TemplatesService.usages()` → 422 + toast). **Cleanup:** legacy
`page_globals`/`page_templates` controllers/services/models/routes/UI removed and their tables dropped
(migration `…220`). Typecheck + build green.

Unifies and levels up the two existing primitives — global header/footer (`page_globals`)
and page templates (`page_templates`) — into one **Templates** system with live composition.
Built on Puck (see [pages-builder.md](pages-builder.md)).

## Locked decisions

- **Template types:** `HEADER`, `FOOTER`, `COMPONENT`, `LAYOUT`.
- **Header/footer application:** all three, with precedence (layout → per-page → site default).
- **Reference semantics:** **live include** (editing a template propagates everywhere it's used)
  — plus a "Duplicate / insert as copy" action for one-off snapshots.
- **Page ↔ layout:** layout is **optional** per page (page can be standalone or wrapped by a layout).

## Why this is feasible on Puck

Puck has no native "symbols", but the sanctioned cross-document composition pattern is a custom
block + `resolveData`/external field that fetches another doc's content and renders it via `<Render>`
(recursively). `resolveData` re-fetches on render → live propagation. This mirrors the
`page_data_resolver` + `CollectionDataContext` we already built for CollectionList.

## Data model

Replaces `page_globals` + `page_templates` with one table:

```
templates
  id            ULID, PK
  name          text
  type          HEADER | FOOTER | COMPONENT | LAYOUT
  content       jsonb            -- Puck block tree
  is_default    boolean          -- default HEADER/FOOTER/LAYOUT for the site
  timestamps, deleted_at (soft delete)

pages  (new nullable FKs → templates)
  layout_id            -- a LAYOUT template that wraps this page
  header_template_id   -- per-page header override (HEADER)
  footer_template_id   -- per-page footer override (FOOTER)
```

**Migration (non-destructive, then drop old tables):**
- `page_globals.header` → `templates(type=HEADER, is_default=true, name='Site Header')`
- `page_globals.footer` → `templates(type=FOOTER, is_default=true, name='Site Footer')`
- `page_templates.*` → `templates(type=COMPONENT)` (or LAYOUT if they look like full pages)
- drop `page_globals`, `page_templates`.

## Header/footer resolution (precedence)

When rendering a public page:
1. **`page.layout_id` set?** → render the LAYOUT; the page's own content fills the layout's
   `PageOutlet`. Header/footer/structure come from the layout (its `TemplateRef` blocks). Layout wins.
2. **No layout** → header = `page.header_template_id ?? default HEADER`; footer =
   `page.footer_template_id ?? default FOOTER`. A page may explicitly choose "(none)" to suppress.

## Composition — the core

### `TemplateRef` block (live include)
- Available in any builder doc (page, layout, or another template).
- Field: pick a template (custom picker filtered to `HEADER | FOOTER | COMPONENT`).
- Render: render the referenced template's `content` via `<Render config data />` (nested).
- **Live**: editing the referenced template updates all callers (no copy).

### `PageOutlet` block (LAYOUT only)
- Marks where a page's own content is injected when the page uses that layout.

### Resolution (mirror `page_data_resolver`)
- A resolver walks the page (+ layout) tree, collects every `TemplateRef` id, and fetches their
  content **recursively** into a map `{ [templateId]: content }`.
- **Guards (required):** cycle detection (A→B→A) via a visited `Set`, and a max depth (e.g. 5).
- SSR/SSG: resolve server-side, inject via a `TemplateContext` provider (like `CollectionDataContext`);
  `TemplateRef` reads content from context (no client fetch, in initial HTML).
- CSR: `TemplateRef` fetches `/api/public/templates/:id` client-side (with a client visited guard).

### Duplicate / insert-as-copy
- A "Duplicate template" action and an "Insert as copy" option in the builder that pastes a
  template's blocks inline (snapshot, no live link) — for the cases where copy is wanted.

## Render pipeline integration

`pages_public_controller.show`:
1. Load page (+ layout if `layout_id`).
2. Resolve header/footer per precedence above → their template content.
3. Resolve `TemplateRef`s recursively (page + layout + header + footer trees) → map.
4. Resolve collections (existing) → map.
5. Inject all into `public/page` props; render (SSR/SSG/CSR as today).
- **SSG cache invalidation:** editing any template clears affected pages' `rendered_html`. MVP:
  clear all page snapshots on template save (templates change rarely); later, track usage for precision.

## Admin UX

- **New sidebar menu "Templates"** (replaces the "Header & Footer" button on the Pages list).
- Templates list: tabs by type (Headers / Footers / Components / Layouts), create (pick type + name),
  edit → reuse the Puck builder at `/admin/templates/:id/edit`. `TemplateRef` is always available;
  `PageOutlet` only in LAYOUT docs.
- Mark default: toggle `is_default` per HEADER/FOOTER/LAYOUT.
- Page form gains: Layout (optional), Header override, Footer override selectors.
- Builder shows a "usage" hint and blocks deleting a template that is referenced.

## Backend

- Model `template.ts`; migration `create_templates_table` + `alter_pages_add_template_fks` + data migration.
- `TemplatesService` (CRUD, list-by-type, setDefault, duplicate, resolveRefs recursive + guards).
- `admin/templates_controller.ts` (+ page route for builder) and public `GET /api/public/templates/:id`.
- Extend `page_data_resolver` (or a sibling) to resolve template refs alongside collections.
- Routes under a new `template:*` RBAC group; `pages` keeps `page:*`.

## Frontend

- `inertia/pages/admin/templates/` (list + the builder reuses `admin/pages/builder` logic).
- `inertia/puck/template-ref.tsx` (block + picker custom field + `TemplateContext`).
- `inertia/puck/page-outlet.tsx` (LAYOUT outlet block).
- Register both in `inertia/puck/config.tsx` (PageOutlet context-gated to layouts).
- Hooks `use-templates.ts`; page form selectors for layout/header/footer.
- Public renderer composes layout + outlet + refs (extend `public-page-view.tsx`).

## Phasing

- **T1 — Unify + Templates section:** `templates` table + migrate `page_globals`/`page_templates`,
  service/controller/routes/RBAC, list (tabs), builder reuse, sidebar menu, default header/footer read
  from templates (preserve current public behavior).
- **T2 — Live composition:** `TemplateRef` block + picker + `/api/public/templates/:id` + recursive
  resolver (cycle/depth guards) + `TemplateContext`. COMPONENT reuse works. + Duplicate/insert-as-copy.
- **T3 — Layouts:** `LAYOUT` type + `PageOutlet` + `pages.layout_id` + per-page header/footer overrides
  + layout/header/footer selectors on the page form + default layout.
- **T4 — Polish:** SSG cache invalidation on template change, usage indicators + delete guards,
  defaults-management UI.

## Risks / open items

- Reference cycle/depth guard (required) — both server resolver and CSR client guard.
- SSG cache invalidation scope on shared-template edits (start broad, refine with usage tracking).
- Migration is non-destructive: migrate data first, verify, then drop `page_globals`/`page_templates`.
- Deleting an in-use template must be blocked or warn (usage lookup).
