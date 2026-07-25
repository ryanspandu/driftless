# Builder Layers Panel (Webflow-style)

Status: **Fase 1–5 DONE** (feature complete).

Goal: turn the Pages/Templates builder's right sidebar into a Webflow-style
editor with a **Layers** navigator (component tree) and a **Detail** (fields)
tab, with per-layer **rename** (double-click), **delete** (hover trash, hidden
when locked), **drag-reorder** (+ drop INTO containers), **hide/show**, and **lock**.

Applies to both [pages/builder.tsx](../../inertia/pages/admin/pages/builder.tsx)
and [templates/builder.tsx](../../inertia/pages/admin/templates/builder.tsx)
because they share `puckConfig` + `puckOverrides` + the `BuilderShell` layout.

## Layout

```
┌───────────────────────┬───────────────┬───────────┐
│ [ Components | Element]│    Preview    │  Layers   │
│  Components = drawer   │    (canvas)   │  (tree,   │
│  Element = fields      │               │  always)  │
└───────────────────────┴───────────────┴───────────┘
```

- Built as a **custom Puck layout** (`<Puck>{children}</Puck>`) in
  [builder-shell.tsx](../../inertia/puck/builder-shell.tsx): composes
  `Puck.Components` / `Puck.Fields` / `Puck.Preview` + our `LayersTree`, and
  **rebuilds the toolbar** (undo/redo via `usePuck().history`, Publish via
  `onPublish(appState.data)`) since custom layout replaces Puck's whole chrome.
- The rebuilt navbar also holds a **device-size switcher** (Mobile/Tablet/Desktop +
  custom px — constrains the preview width), **panel toggles** (show/hide the left
  and right sidebars), and a **Settings gear** that opens the **Page Settings** dialog
  (General · SEO/Meta · Page code · Global code). See [page-settings.md](./page-settings.md).
- The LEFT panel auto-switches to **Element** when a component is selected; the
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
  drop indicator; guard against dropping onto own descendant. Canvas DnD still works.
  **Drop INTO containers** (2026-06-24): a container row (any type with a `slot`)
  has 3 drop zones — top/bottom thirds = sibling before/after, **middle third =
  drop inside** (the only way to fill an *empty* container from the tree). Inside-drop
  addresses the first slot's zone (`` `${containerId}:${slot}` ``) and appends;
  shown by a full-row ring instead of a line. `TreeNode.isContainer` =
  `slotFieldsFor(type).length > 0`. Tree row labels prefer the config `label`.
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

## Element panel (Webflow-style Style panel)

The left tab is labeled **Element** (`leftTab === 'element'` in builder-shell.tsx).
It is a custom, Webflow-like Style panel in
[detail-panel.tsx](../../inertia/puck/detail-panel.tsx) — it **replaces**
`Puck.Fields`. With a component selected it shows that element's Content + style
sections; with **nothing selected** it shows an empty state ("No element selected")
instead of the Puck root fields. Controls live in
[style-controls.tsx](../../inertia/puck/style-controls.tsx).

Sections (collapsible, in order): **Content · Flex Child · Layout · Spacing ·
Size · Position · Typography (+ More type options) · Background · Borders ·
Effects · Advanced**. Webflow conventions matched: bold section headers + chevron,
compact `[label | control]` rows, the **label turns blue when the prop is set**,
unit dropdowns (PX/%/REM…), segmented controls, colour swatches, sliders, and the
nested margin/padding (Spacing) + inset (Position) + radius (Borders) box widgets.

Key implementation facts:
- Every style prop is a **plain CSS string on the component's own props** (e.g.
  `display`, `flexDirection`, `gap`, `position`, `top`, `opacity`, `borderStyle`,
  `boxShadow`…) applied by `styleToCss()` in `style-fields.tsx`. Adding a control =
  add the prop to `styleToCss` + render a control that reads/writes it. **No data
  migration** — additive, backward-compatible.
- Dedicated section components (`LayoutSection`, `SizeSection`, `PositionSection`,
  `TypographySection`, `BordersSection`, `EffectsSection`, `FlexChildSection`,
  `AdvancedSection`, plus `SpacingControl`) own their props and write via the
  shared `update()` (a `replace` dispatch). Generic `FieldRow` handles the rest
  (Content fields call the field's own Puck `render`, so custom editors like
  image/rich-text/collection keep working).
- `STYLE_KEYS` (union of every section's keys) is what excludes style props from
  the **Content** section. Gated on `hasStyle` (`'maxWidth' in fields`) so
  Spacer/PageOutlet (no styleFields) only show their own Content fields.
- Reusable controls: `NumberUnitControl` (number+unit), `SegmentedControl`,
  `ColorControl` (swatch+hex+native picker), `BoxModelControl` (4-value shorthand,
  `labels` overridable → reused for border radius corners), `SpacingControl`
  (nested margin/padding), `OffsetControl` (position inset), `BoxShadowControl`.

## Detail panel must handle every Puck field type

The Detail panel **replaces** `Puck.Fields`, so `FieldControl` (detail-panel.tsx)
must explicitly render **every** Puck field type a block uses, or that field
silently falls back to a text box (or, for `array`, breaks). Handled: `custom`
(calls `field.render`), `select`, `radio` (button group), `array` (`ArrayControl`
— add/remove items, recurses into `arrayFields`), `textarea`, `number`, and `text`
(default). When adding a block with a new field type, add its case here too.

## Open decisions

- ~~Hidden nodes in the editor canvas: dim vs fully hidden?~~ Resolved: **dim**
  in the editor (opacity 0.4, still selectable), fully hidden on publish.
- ~~Drop **into** an empty container via the tree?~~ Resolved (2026-06-24): the
  middle third of a container row drops inside it.
