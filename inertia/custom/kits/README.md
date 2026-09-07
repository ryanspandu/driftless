# Custom template kits

A **kit** is a fully hand-coded page as one self-contained folder — the
WordPress-theme counterpart to a single-file code page under
`inertia/custom/pages/`. Everything a kit needs (React/TSX, styling,
sub-components, imported assets) lives in its own folder here.

## Anatomy

```
inertia/custom/kits/<name>/
  kit.json          required — marks the folder as a kit + names it for the picker
  index.tsx         required — default export: (props: CodePageProps) => JSX
  components/…       optional — sub-components, imported with relative paths
  styles.css        optional — co-located CSS, imported by index.tsx
  assets/…           optional — images/fonts, IMPORTED (never referenced by raw path)
```

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
