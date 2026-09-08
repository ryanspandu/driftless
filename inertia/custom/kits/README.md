# Custom template kits

A **kit** is a fully hand-coded page as one self-contained folder — the
WordPress-theme counterpart to a single-file code page under
`inertia/custom/pages/`. Everything a kit needs (React/TSX, styling,
sub-components, imported assets) lives in its own folder here.

## Anatomy

```
inertia/custom/kits/<name>/
  kit.json          required — marks the folder as a kit + names it for the picker
  index.tsx         a template a DB page points at (kit:<name>) — optional if you only ship pages/
  pages/*.tsx       file-pages — each file is a route with NO DB row (see below)
  templates/*.tsx   code chrome — header/footer/layout a page points at (codetpl:<kit>/<type>)
  collection/*.tsx  collection templates — one CMS record as code; filename = collection key
  components/…       optional — sub-components, imported with relative paths
  styles.css        optional — co-located CSS, imported by index.tsx
  assets/…           optional — images/fonts, IMPORTED (never referenced by raw path)
```

The committed **`example/`** kit is a complete reference: `index.tsx` (a template) **and** a
`pages/` folder (file-pages at `/kit-example/*`) sharing `components/page-shell.tsx`. Copy it,
rename it, and edit.

## File-pages — a folder of routes, no database rows

Each `pages/*.tsx` is a standalone route served with no DB row. The filename is the URL path
(root-level; `index` → home), overridable with `export const path = 'company/about'`; the title
is the titleized filename, overridable with `export const title = '...'`. A database page always
wins on a path clash. File-pages are pure code (no editable region) and show in the admin pages
list as read-only rows. Full reference: [`docs/ai/custom-templates.md`](../../../docs/ai/custom-templates.md).

## Collection templates — render CMS records as code

Each `collection/<key>.tsx` draws **one** record of a collection as code. On a **Collection List**
block, set *Item design → Code template* and pick it (the **filename is the collection key** — a
`collection/posts.tsx` only offers itself on a list bound to `posts`). The component
default-exports `({ record }) => JSX` and gets the whole record — `record.data` holds the fields,
with `record.id` / `status` / `createdAt` / `updatedAt` alongside. Type the prop with
`CustomCollectionRecord` from `~/custom/registry`. See `example/collection/posts.tsx`.

- The **folder name is the id.** A page selects a kit by storing
  `component = "kit:<folder>"`; the public URL comes from the page record, not
  the folder.
- `kit.json` = `{ "name": "...", "description": "..." }` — shown in the
  create-page picker. Its presence is also what marks the folder as a kit.
- `index.tsx` receives `CodePageProps` (see `inertia/custom/types.ts`): `title`,
  `path`, `seo`, `header`, `footer`, `bindings`, `preview`. Wrap your markup in
  `<SiteChrome header footer>` to sit inside the real site header/footer, or omit
  it to own the whole viewport.
- Add `export const editableRegion = true` and render `<BuilderRegion />` to
  expose a slice of the page to the visual builder.

## Rules

- **Use app libraries only.** Import anything already in the root `package.json`
  (React, Tailwind, TanStack Query, recharts, tiptap, dnd-kit, phosphor/lucide
  icons, …) and any `~/components` / `~/lib`. Do **not** `npm install` inside a
  kit — there is no per-folder dependency resolution.
- **Import your assets** (`import hero from './assets/hero.jpg'`) so Vite
  fingerprints them; never reference a raw path. Large media → the media library.
- **A rebuild is required** after adding or renaming a kit (the lookup is a
  build-time glob). Editing an existing kit's code is picked up by the dev
  server's HMR.
- **CSP:** React inline `style={}` is fine; do not inject inline `<script>` /
  `<style>` tags. Compiled TSX + co-located CSS is served from your own origin,
  so it just works.

## Start here

Copy `example/`, rename it, edit `index.tsx`. The full reference — available
libraries, the core UI inventory, design tokens, and CSP details — lives in
[`docs/ai/custom-templates.md`](../../../docs/ai/custom-templates.md).

Kit folders are gitignored (they are operator payloads); `example/` and this
README are the committed exceptions.
