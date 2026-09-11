# Driftless MCP — design-layout extraction + layout lint

**Status:** Shipped (2026-09-11) on `develop`. Unit-tested; **live MCP round-trip unrun** (needs a dev-server restart so the new routes/tools load, then a fresh MCP session — the tool list is fixed per session).

Follow-on to [mcp-fidelity-review.md](./mcp-fidelity-review.md). That review proved the page builder can already express every fidelity miss (position, align, overlays); the losses come from the model **authoring blind** — it transcribes Lunacy numbers by hand and no check measures the built layout. The Static Bloom rebuild shipped six such bugs, all fixable with existing styleProps:

1. hero content centred (should be far-left) · 2. hero CTAs hidden behind the feature strip · 3. missing cabinet "+" hotspots · 4/5. two section headers `alignItems:flex-end` instead of `flex-start` · 6. testimonials heading left instead of centred.

This work removes the guessing (extract layout facts + scaffold) and grades the result (render-geometry lint). Four additive changes; no DB migration (facts live in the existing `design_brief` JSON column).

## 1. Design-layout extraction — Lunacy FREE → facts + scaffold

`app/services/design_layout_service.ts` (new). Tool-agnostic: a Figma adapter can produce the same `LayoutNode` shape later.

- `normalizeFreeFrame(free)` — walks a Lunacy FREE frame subtree and infers, from `pos`/`size` (always present): role (`heading`/`paragraph`/`button`/`image`/`badge`/`container`…), absolute bbox, and per-container **flexDirection / alignItems / justifyContent** (a *packing-ratio* test: row items tile the horizontal extent, stacked items overlap it — robust to an indented child) plus **textAlign** (from the text box's centring within its parent). This is the signal that would have caught #1/#4/#5/#6.
- **Overlay detection (badges over images)** — a badge/icon/instance whose box sits inside an image *sibling* becomes an overlay with `left/top` as a % of the image. Repeated "+" hotspots fall out automatically (#3).
- `scaffoldFromLayout(facts)` — emits a fill-ready Puck doc: containers with the inferred flex props, headings/paragraphs with `align`, and each image with overlays wrapped in a `position:relative` DivBlock + `position:absolute` marker blocks. Block ids are carried so the lint can match built→design by id.
- `toExpectations(facts)` — a compact `{ blockId: {role, textAlign, alignItems, justifyContent, isOverlay} }` map, stored on the brief for the lint.

**Tool:** `analyze_layout({ id, frame, mode })` → `POST /api/mcp/v1/pages/:id/analyze-layout` → `PagesController.analyzeLayout` ([pages_controller.ts](../../modules/mcp/controllers/api/pages_controller.ts)). Persists expectations into `brief.layout.expects` (merged, so one call per section). A >1.5 MB frame is rejected (pass one section at a time).

## 2. Layout-aware lint — render-geometry probe

Deterministic, complements `check_design_coverage` (structure) and `compare_to_reference` (eyeball).

- `probeLayout(url, viewport)` in [screenshot_service.ts](../../app/services/screenshot_service.ts) — reuses the shared headless Chromium to read every `[data-pb-id]` block's `getBoundingClientRect` + computed `textAlign/alignItems/justifyContent/position/display` + an **occlusion hit-test** (`elementFromPoint` at the block centre, after scroll-into-view) that catches a CTA hidden behind an overlapping band (#2).
- `lintLayout({ probe, expects })` in [layout_lint.ts](../../modules/mcp/services/layout_lint.ts) — diffs geometry vs expectations and returns `issues[]` of kind `text-align` / `cross-axis` / `main-axis` / `occluded` / `missing-overlay`, **each with a ready `patch_page_content` `suggestedOp`**. Matching is by block id (scaffold path); un-matched built blocks are skipped, not false-flagged.

**Tool:** `lint_layout({ id, viewport })` → `GET /api/mcp/v1/pages/:id/lint-layout` → `PagesController.lintLayout`.

**Render change:** `Box` ([style-fields.tsx](../../inertia/puck/style-fields.tsx)) emits `data-pb-id={props.id}` **only on the draft-preview render** (`/preview/<token>`, which is what the probe hits) — gated by a new `PreviewContext` ([breakpoints.ts](../../inertia/puck/breakpoints.ts)) fed from `page.preview` in [public-page-view.tsx](../../inertia/puck/public-page-view.tsx). Live PUBLISHED pages and the SSG snapshot are byte-for-byte unchanged (no extra attribute, no internal ids on production HTML); zero FE JS/CSS added anywhere. Not a styleProp, so `mcp_style_vocabulary.spec.ts` stays green.

## 3. Overlay ingestion

Not a separate tool — the overlay-detection rule in `normalizeFreeFrame` + the absolute-marker emission in `scaffoldFromLayout`. The tractable slice of the fidelity review's **F8** (artboard); full page-level absolute artboards remain future work.

## 4. `section-header` recipe + preset

Prevents the #4/#5 class with a correct canonical structure.

- Recipe in `GUIDANCE_RECIPES` ([commands/mcp_catalog.ts](../../commands/mcp_catalog.ts)) — heading-left + subtext/CTA-right, **`alignItems:flex-start`** (top-aligned), `justifyContent:space-between`; centred-title variant noted.
- DB preset `seedsec-header` "Section — Header" in [section_presets_seeder.ts](../../database/seeders/section_presets_seeder.ts) (token-driven; `list_section_presets` → `insert_section`).

## Flow the model runs

`analyze_layout(section frame)` → `set_page_content(scaffold)` → fill real text/images/colours with `patch_page_content` → `lint_layout` until clean → `compare_to_reference`. `analyze_layout` seeds the expectations `lint_layout` grades against.

## Files

New: `app/services/design_layout_service.ts`, `modules/mcp/services/layout_lint.ts`, `tests/unit/mcp_design_layout.spec.ts`.
Edited: `app/services/screenshot_service.ts` (`probeLayout`), `inertia/puck/style-fields.tsx` (`data-pb-id`), `modules/mcp/controllers/api/pages_controller.ts` (2 handlers), `modules/mcp/routes.ts` (2 routes), `modules/mcp/mcp_tools.ts` + `modules/mcp/server/src/index.ts` (2 tools + `pages` profile — kept in sync, guarded by `mcp_manifest_sync.spec.ts`), `commands/mcp_catalog.ts` (recipe), `database/seeders/section_presets_seeder.ts` (preset).

## Verify

- Unit: `node ace test unit --files="mcp_design_layout"` — 9 tests; bugs #1–#6 are the regression fixture (extractor infers, lint flags, `suggestedOp`s correct).
- Parity/guards: `mcp_manifest_sync`, `mcp_style_vocabulary` green.
- After changing the catalog/preset: `node ace mcp:catalog` + re-seed + **restart the dev server** (services/routes are not hot-reloaded).
- Live round-trip (unrun): restart dev server, then in a fresh MCP session run the flow above on a Static Bloom section and confirm `lint_layout` reports 0 issues.

## Notes / risks

- Flex/text-align inference is heuristic — the tool returns raw facts too, and lint issues are advisory (never auto-patched). Typography (exact size/weight) is not recovered from FREE; left for the model to fill.
- `#1` (a column centred by `margin:auto`, not `alignItems`) is prevented at authoring time by the scaffold emitting the correct left-alignment; the lint's alignItems/text-align/occlusion checks cover the rest. A parent-relative center-offset check is possible future work.
