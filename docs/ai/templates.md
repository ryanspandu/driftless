# Templates — reusable headers, footers, components & layouts

> **`EMAIL` is a fifth type, and it does not use the page blocks.** An email
> template is designed with a separate, table-based block set
> (`inertia/puck/email-config.tsx`), flattened to HTML in the browser on publish
> and stored in `templates.rendered_html`. Wired to an email in Settings → Email
> → Notifications. Never served by `/api/public/templates/:id`. Full reasoning
> in [mail.md](./mail.md#designing-an-email-in-the-page-builder).

> **`COLLECTION` is a sixth type: a reusable item card scoped to one CMS collection.**
> Where a `CollectionList` block learns its collection from an ancestor list, a COLLECTION
> template *is* the item — its **whole canvas** binds to one collection (document-level scope),
> stored in `templates.collection_key` (`Template.collectionKey`; the column is meaningful only
> for this type — `TemplatesService.collectionKeyFor` nulls it elsewhere and *requires* it here).
> It is never served or rendered on its own: a `CollectionList` in **"template" mode** points its
> `templateId` at one and repeats it once per record. Details in
> [its section below](#collection-templates--per-collection-item-cards). `— Default —` uses the site default
> template, `— None —` renders no header/footer at all, and picking one overrides just that
> page. "None" is stored as `pages.hide_header` / `hide_footer` rather than a sentinel id,
> because those id columns carry a real foreign key to `templates` — and because a null id
> already meant "default", leaving no way to say "none". A sign-in screen or a bare landing
> page needs it.
>
> Note also that `layout_id`, `header_template_id` and `footer_template_id` were **never read
> from the request body** by `admin/pages_controller` until "None" was added — the Layout and
> override pickers had been silently discarding every choice since they shipped.

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

- **Template types:** `HEADER`, `FOOTER`, `COMPONENT`, `LAYOUT` (plus `EMAIL` and
  `COLLECTION`, added later — see their callouts near the top).
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

## COLLECTION templates — per-collection item cards

A **`COLLECTION`** template is a reusable builder document that designs **one item card** for a
single CMS collection. Unlike a per-block Collection List (which learns its collection from the
list it sits in), a COLLECTION template's *entire* document is bound to its collection — a
**document-level collection scope**. It is never a standalone page; a `CollectionList` in
"template" mode repeats it once per record.

**Kind + bound collection (`app/models/template.ts`).** `TemplateType` gains `COLLECTION`, and a
nullable `collectionKey` column (`templates.collection_key`) records which collection the card is
for. `TemplatesService.collectionKeyFor` enforces the invariant: the key is kept **only** for
`COLLECTION` (nulled for every other type, so a header can't claim a collection), and creating a
COLLECTION template **without** a collection throws (`'A collection template must be bound to a
collection'`). `collectionKey` rides on the summary/DTO and is preserved by `duplicate`.

**Creation.** In the **Templates** admin, pick type "Collection item" and choose a *bindable*
collection (`useBindableCollections`) — `template-form-dialog.tsx`. Templates list gets a
**Collections** tab (`?tab=collection`). The common path is a deep link straight from a Collection
List's Template picker: `/admin/templates?new=COLLECTION&collection=<key>` opens the create dialog
pre-filled (type + collection). Row actions omit "Set default" for COLLECTION (a card has no
site-wide default — it's chosen per list).

**Block set (`inertia/puck/collection-config.tsx`).** `collectionPuckConfig` is the page block set
**minus** two blocks that make no sense inside a repeated card: `CollectionList` (a list inside
every list item would fetch N times and make the bind scope ambiguous) and `PageOutlet` (a card has
no page body to slot). Everything else — including Settings-tab field binding — works as on a page.
Resolved lazily via getters, same import-order reason as `puckConfig`.

**Document scope in the builder (`inertia/pages/admin/templates/builder.tsx`).** When the template
is COLLECTION, the builder picks `collectionPuckConfig` and wraps the canvas in two providers
(the iframe is disabled, so both reach it):
- `CollectionScopeContext.Provider value={collectionKey}` — the document-level scope. Consumed by
  `useCollectionScope()` (`inertia/puck/record-binding.tsx`): the Settings tab / "Get text/image
  from" bind pickers fall back to this when a block has **no** enclosing Collection List ancestor,
  so a bare card still offers its collection's fields.
- `RecordContext.Provider` seeded with the **newest published record** of the collection
  (`useRecords`, limit 1) as `editing: true`, so bound elements preview real data on the canvas
  (bindings/`{{tokens}}` stay legible when the collection has no record yet). A "Item card ·
  `<key>`" badge marks the mode.

**Rendering (`inertia/puck/collection-list.tsx`).** A COLLECTION template only renders through a
`CollectionList` whose `template` prop is `'template'` and whose `templateId` names it. The list
picker (`collection-template-field.tsx`) offers **only** COLLECTION templates whose `collectionKey`
matches the list's own collection. `useCollectionTemplate` loads the doc **once** for the whole
list — from the preloaded `TemplateContext` (SSR/SSG) or a single client fetch — and renders
`<Render config={collectionPuckConfig-or-page} data={template.content} />` once per record, each
wrapped in that record's `RecordContext` so bindings resolve per row.

**Public resolution / SSG.** `TemplatesService.collectRefIds` treats a `CollectionList`'s
`templateId` exactly like a `TemplateRef`'s (same `"templateId":"<id>"` needle), so the recursive
`resolveRefs` preloads the card into `TemplateContext`, `usages()` counts pages/templates that
repeat it (delete-guarded), and editing it invalidates SSG snapshots like any shared template.
