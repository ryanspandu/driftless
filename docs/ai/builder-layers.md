# Builder Layers Panel (Webflow-style)

Status: **Fase 1–5 DONE** (feature complete).

Goal: turn the Pages/Templates builder's right sidebar into a Webflow-style
editor with a **Layers** navigator (component tree) and a **Detail** (fields)
tab, with per-layer **rename**, **drag-reorder**, **hide/show**, and **lock**.

Applies to both [pages/builder.tsx](../../inertia/pages/admin/pages/builder.tsx)
and [templates/builder.tsx](../../inertia/pages/admin/templates/builder.tsx)
because they share `puckConfig` + `puckOverrides` + the `BuilderShell` layout.

## Layout

```
┌──────────────────────┬───────────────┬───────────┐
│ [ Components | Detail]│    Preview    │  Layers   │
│  Components = drawer  │    (canvas)   │  (tree,   │
│  Detail = fields      │               │  always)  │
└──────────────────────┴───────────────┴───────────┘
```

- Built as a **custom Puck layout** (`<Puck>{children}</Puck>`) in
  [builder-shell.tsx](../../inertia/puck/builder-shell.tsx): composes
  `Puck.Components` / `Puck.Fields` / `Puck.Preview` + our `LayersTree`, and
  **rebuilds the toolbar** (undo/redo via `usePuck().history`, Publish via
  `onPublish(appState.data)`) since custom layout replaces Puck's whole chrome.
- The LEFT panel auto-switches to **Detail** when a component is selected; the
  RIGHT **Layers** panel is always visible — clicking a layer selects it but
  never hides the tree (this was the reason for moving to a custom layout: with
  the `fields`/`outline` overrides, Layers + Detail had to share one panel).
- Puck's editor chrome is light-only by design; the builder themes it dark via
  `html.dark` Puck-var overrides in [app.css](../../inertia/css/app.css), and the
  canvas stays light via a `.theme-light` wrapper in `puckConfig.root.render`.
  The canvas runs **without** Puck's iframe (`iframe={{ enabled: false }}`) — the
  iframe auto-frame path froze the editor.

## Key Puck integration notes (non-obvious)

- **Why custom layout, not overrides.** The `fields`/`outline` overrides are
  position-locked (fields=right, components=left) AND feed `Puck.Fields` /
  `Puck.Outline` — so you can't override `fields` to show Layers while also
  rendering real fields via `Puck.Fields` elsewhere (it gets the override too,
  i.e. blanks). The custom layout sidesteps both. Only `componentItem` override
  remains (drawer tile styling).
- The Layers tree is **custom** ([layers-tree.tsx](../../inertia/puck/layers-tree.tsx)),
  built from `usePuck().appState.data.content`, recursing into each component's
  `type: 'slot'` fields (read from `usePuck().config`). A custom tree is required
  because `Puck.Outline` can't host per-row controls (rename/reorder/hide/lock).
- Per-layer metadata lives on the component's own props under `_`-prefixed keys
  (`_label`, later `_hidden`, `_locked`). It travels with the page JSON — **no DB
  migration** — and is ignored by the render path (`Box` only reads style keys).
- `usePuck()` API used: `appState`, `config`, `dispatch`, `selectedItem`,
  `getSelectorForId(id)` → `{index, zone}`, `getItemById(id)`.
- Dispatch actions: select = `setUi { itemSelector }`; rename = `replace`
  (same item, updated props); reorder = `reorder` (same zone) / `move` (cross
  zone); lock (Fase 5) = `config.resolvePermissions` returning
  `{ drag/delete/duplicate/edit: false }` for `_locked` items.

## Phases

- **Fase 1 — Relocate + Tabs + Auto-switch.** DONE. Outline moved to the right
  panel's Layers tab; tabbed `[Layers | Detail]`; auto-switch on selection.
- **Fase 2 — Custom tree + Rename.** DONE. Recursive tree with select,
  expand/collapse, and inline rename (double-click → `_label`).
- **Fase 3 — Drag-and-drop reorder.** DONE. Native HTML5 DnD: drag a tree row to
  reorder within its parent (`reorder`) or across parents (`move`); before/after
  drop indicator; guard against dropping onto own descendant. Canvas DnD still
  works. v1 limitation: can only drop before/after an existing row (no dropping
  into an empty container via the tree yet).
- **Fase 4 — Visibility (hide/show).** DONE. Eye toggle per row → `_hidden`.
  `Box` (and Spacer, routed through Box) reads `_hidden` + `puck.isEditing`
  (spread into `s`): hidden → `null` on public/SSR, dimmed (opacity 0.4) in the
  editor so it stays selectable. Tree row dims + shows an eye-off toggle.
- **Fase 5 — Lock.** DONE. Lock toggle per row → `_locked`. A `resolvePermissions`
  resolver is attached to **every** component in [config.tsx](../../inertia/puck/config.tsx)
  (Puck only exposes permissions per component) → locked = `{drag, duplicate,
  delete, edit}: false`. The tree row is also `draggable={false}` when locked, and
  shows a lock icon. Unlocking always works: it's a programmatic `replace` dispatch
  from the tree, which isn't gated by these UI-level permissions.

## Open decisions

- ~~Hidden nodes in the editor canvas: dim vs fully hidden?~~ Resolved: **dim**
  in the editor (opacity 0.4, still selectable), fully hidden on publish.
- Drop **into** an empty container (nesting) vs only before/after siblings —
  still before/after only (Fase 3 v1 limitation).
