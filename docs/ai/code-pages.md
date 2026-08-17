# Code pages — hand-written React alongside the builder

**Status:** implemented.

A page is either a **builder document** (Puck blocks, `kind = BUILDER`) or a **code page**
(a React component you wrote, `kind = CODE`). Both are rows in `pages`, so a code page keeps
its path, Draft/Published state, SEO fields, preview and header/footer selection — only the
markup comes from a file instead of a block tree.

There is also a smaller escape hatch: your own React components registered as **builder
blocks**, for a page that is mostly content with one bespoke piece.

## Which to use

| Situation | Use |
|---|---|
| Marketing, landing, content pages; anything a non-developer should edit | **Page builder** |
| One custom piece on an otherwise editable page | **Custom block** |
| Bespoke layout, heavy interactivity, hand-tuned markup nobody will edit visually | **Code page** |
| Coded structure, but one area an editor must be able to change | **Code page + `<BuilderRegion />`** |

> **Rule for AI assistants:** build pages with the **page builder**. Code pages exist for a
> human who has decided the builder is the wrong tool for one specific page. Do not convert
> a builder page to a code page, or create code pages, unless explicitly asked.

## Code pages

### Write one

`inertia/custom/pages/<slug>.tsx` — the filename is the slug.

```tsx
import { SiteChrome } from '~/custom/site-chrome'
import type { CodePageProps } from '~/custom/types'

export default function About({ title, header, footer }: CodePageProps) {
  return (
    <SiteChrome header={header} footer={footer}>
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-4xl font-semibold">{title}</h1>
      </main>
    </SiteChrome>
  )
}
```

Then create a page in `/admin/pages`, choose **Custom React component** under *Built with*,
and pick the slug. `inertia/custom/pages/playground.tsx` is a working reference.

### Props

`CodePageProps` (`inertia/custom/types.ts`): `title`, `path`, `seo`, `globalMeta`, `header`,
`footer`, `bindings`, `preview`. Block-data plumbing is deliberately not forwarded — a page
should not need to know about resolvers to render a heading.

Per-page and site-wide custom code (Website Settings → analytics, pixels) run on code pages
too, via the shared `<PublicPageFrame>`. They did not at first; see the note below.

`<SiteChrome>` is **opt-in**. Wrap your content in it to sit inside the site header and footer
(the real templates from `/admin/templates`, so header edits reach your page without touching
it). Drop it to own the whole viewport.

The `<head>` — title, description, `og:`, canonical, robots, site meta — is emitted for you
from the page's SEO fields, by the same `<PublicPageHead>` a builder page uses.

### Editable regions

A code page can leave one area editable in the page builder — you own the structure and
everything around it, an editor owns the middle.

```tsx
import { BuilderRegion } from '~/custom/builder-region'

export const editableRegion = true   // tells the admin to open the builder

export default function About({ title, header, footer }: CodePageProps) {
  return (
    <SiteChrome header={header} footer={footer}>
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-4xl font-semibold">{title}</h1>
        <BuilderRegion />
      </main>
    </SiteChrome>
  )
}
```

The region's content is the page's own `content` column — the *same* column a builder page
uses. That is what makes this cheap: the page builder edits it unchanged, and every block
behaves identically, because the server resolves template refs, bound collections and block
data for it exactly as it does for a builder page (it skips that work only when the region is
empty).

- **One region per page.** Two independently editable areas is better served by two pages, or
  by a Template Reference block inside the one region.
- **`export const editableRegion = true` is required.** Whether a component renders a region
  is only knowable by rendering it, so the admin cannot infer it — without the flag it shows
  the "built in code" notice instead of the builder.
- The builder canvas shows **only the region**, not the code around it — the same way it does
  not show the header, footer or layout. Its topbar names the file the region belongs to.
- An empty region renders **nothing** for a visitor; the placeholder hint appears in the admin
  preview only.

### Render modes

All three work exactly as for a builder page. SSR/SSG render through `public/code_ssr`
(allowlisted in `config/inertia.ts`), CSR through `public/code`. SSG snapshots and their
build-stamp invalidation behave identically.

### Adding a page requires a rebuild

Discovery is `import.meta.glob`, which Vite expands **at build time**, plus a generated
manifest. A `.tsx` added after the build is invisible until the front end is rebuilt — the
same constraint modules have. In dev the pre-hooks regenerate the manifest and Vite reloads;
in production it is a deploy.

### Why the database never stores an Inertia page name

The obvious design — store `public/about` on the row and hand it to `inertia.render()` — was
rejected. `renderPage()` casts the name to `never` and Inertia's resolver is an exact key
lookup that throws inside an async `resolve`, so a wrong name is an unhandled rejection and a
blank screen, not a 404. (That failure is live in this repo: two `modules/announcements`
controllers still render `plugins/announcements/*`, which stopped existing at the
plugins→modules migration.)

Instead one wrapper page resolves the component from a glob scoped to
`inertia/custom/pages/`. A row therefore cannot address `admin/users`; a missing slug renders
a panel naming the file it wanted; `ssr.pages` stays a two-item array; and `pages.d.ts` is
untouched. This mirrors the builder, where `public/page_ssr` renders arbitrary content from
data.

### Why one frame renders both

`<PublicPageFrame>` (head, site-wide CSS/JS, block contexts, preview badge) is shared by the
builder and code renderers because the two had already drifted: a code page emitted no
site-wide CSS and ran no site-wide JS, so analytics and pixel scripts configured in Website
Settings simply did not fire on those URLs. Nothing errored — the numbers were quietly
incomplete. One component is what stops that happening again.

`scripts/generate-code-pages.mjs` writes `app/services/code_pages.generated.ts` at
prebuild/predev/preserve/pretest. `PagesService` validates `component` against it, so a bad
value is **rejected on save** rather than discovered in production; the admin picker is fed
from the same list.

## Custom builder blocks

`inertia/custom/blocks/*.tsx`, default-exporting a `CustomPuckBlocks` object. They appear in
the drawer under **Custom**. `inertia/custom/blocks/callout.tsx` is a working reference.

```tsx
export default {
  icons: { Callout: Megaphone },
  components: {
    Callout: {
      label: 'Callout',
      fields: { text: { type: 'textarea' }, ...styleFields },
      defaultProps: { text: 'Hello' },
      render: ({ text, ...s }) => <Box s={s}>{text}</Box>,
    },
  },
} satisfies CustomPuckBlocks
```

Spread `styleFields` and wrap in `<Box>` to inherit the whole Element panel (spacing, size,
background, borders) for free. Core and module blocks win on a name collision — a custom
block cannot redefine `Heading`. Same build-time discovery, so a new block file needs a
rebuild.

## Files

| Path | Role |
|---|---|
| `inertia/custom/pages/*.tsx` | Your page components |
| `inertia/custom/blocks/*.tsx` | Your builder blocks |
| `inertia/custom/types.ts` | `CodePageProps` |
| `inertia/custom/site-chrome.tsx` | Opt-in site header/footer |
| `inertia/custom/builder-region.tsx` | `<BuilderRegion />` |
| `inertia/custom/registry.ts` | Slug → component, and the region flag |
| `inertia/components/public-page-frame.tsx` | Head, custom code and block contexts, shared with the builder renderer |
| `inertia/custom/code-page-view.tsx` | Slug → component resolution |
| `inertia/pages/public/code{,_ssr}.tsx` | The two wrapper pages |
| `inertia/puck/custom-blocks.ts` | Block registry fold |
| `app/services/code_pages.generated.ts` | Generated manifest (do not edit) |
| `scripts/generate-code-pages.mjs` | Writes the manifest |
