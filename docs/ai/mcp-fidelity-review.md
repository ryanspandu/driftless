# Driftless MCP — design-fidelity review (Lunacy → page)

Test case: rebuilding Lunacy **Frame 2085660747** ("Static Bloom" furniture landing) into the page `static-bloom-fix` via the Driftless MCP, with the Lunacy MCP wired to the live design file (so exact px/colour/font data was available). Result is close, but with recurring misses on **position, margin/padding, font-size, font-style, container width, text-align**, and the **header template**. This documents *why* and the concrete fixes.

## Framing: where fidelity is actually lost

The Driftless MCP does **not** ingest Lunacy. The model reads Lunacy's exact numbers and emits Puck blocks; the MCP validates + renders them. So drift has three sources, in order of impact:

1. **Silent prop-dropping (no aliasing).** The names a converter naturally emits (`textAlign`, `fontSize`, `fontFamily`, `color`, `backgroundColor`, `marginTop`) are **not** what the renderer reads (`align`, `textSize`, `font`, `textColor`, `bg`, shorthand `margin`). Unknown keys are **warned, then ignored** — never applied, never blocked. The warning is buried in a ~250 KB echo, so the converter never notices.
2. **Block base styles that beat author props.** A few blocks hard-code layout/typography that overrides what the author sets (or supplies no sensible default at all), so exact values silently don't take.
3. **Missing expressiveness.** No per-side margin/padding longhands, no per-corner radius, no filled icons, and no "artboard" concept to carry a frame's absolute x/y.

Point 1 is the big one — it explains most of what the reviewer saw.

---

## Findings (symptom → root cause `file:line` → fix)

### F1 — Per-side margin/padding are dropped  ⟶ P0
`styleToCss` reads only the `margin`/`padding` **shorthand** ([style-fields.tsx:194](../../inertia/puck/style-fields.tsx#L194)); `marginTop`/`paddingLeft`/… aren't in `RENDERED_STYLE_PROP_NAMES` ([style-fields.tsx:318](../../inertia/puck/style-fields.tsx#L318)) and the validator only warns ([puck_content_validator.ts:372](../../modules/mcp/services/puck_content_validator.ts#L372)). This is the exact `"Section" has no prop "marginTop"` I hit — the hero/feature-bar overlaps needed `margin:"-81px 0 0 0"` shorthand instead.
**Fix:** read the 8 longhands in `styleToCss` (`marginTop→css.marginTop`, …) and add them to `RENDERED_STYLE_PROP_NAMES`. A design tool exports per-side spacing; the converter should be able to pass it straight through.

### F2 — Natural CSS aliases are dropped  ⟶ P0
`styleToCss` reads `align` / `textSize` / `font` / `textColor` / `bg` only ([style-fields.tsx:198‑219](../../inertia/puck/style-fields.tsx#L198)). So `textAlign`, `fontSize`, `fontFamily`, `color`, `backgroundColor` are silently ignored. (The email system even uses `fontSize` itself — [email-config.tsx:62](../../inertia/puck/email-config.tsx#L62) — so the "wrong" name is the intuitive one.)
**Fix:** add an ingest-time alias map (`textAlign→align`, `fontSize→textSize`, `fontFamily→font`, `color→textColor`, `backgroundColor→bg`) in the validator/normalizer so both names work; keep the catalog names canonical. Cheapest single win for accuracy.

### F3 — `HFlex` ignores author `flexWrap`  ⟶ P0
`HFlex` hard-codes `flexWrap:'wrap'` in its base and `mergeLayout` lets the base win over `s` (`{...s, ...base}`) ([config.tsx:681](../../inertia/puck/config.tsx#L681), [style-fields.tsx:174](../../inertia/puck/style-fields.tsx#L174)). An author's `flexWrap:"nowrap"` (e.g. a single-row testimonial track) is discarded → rows wrap unexpectedly. `gap`/`alignItems`/`justifyContent` are handled correctly (destructured + default-only), `flexWrap` is not.
**Fix:** destructure `flexWrap` and default it only when unset, exactly like `alignItems`.

### F4 — `Heading` forces weight/tracking and has no default size  ⟶ P1
`Heading` renders with `className="font-semibold tracking-tight"` and no font-size ([config.tsx:709](../../inertia/puck/config.tsx#L709)). Under Tailwind preflight, `h1–h6` inherit body size, so **every** heading needs an explicit `textSize` or it renders at 16px, and it's always 600/tight unless the author overrides `fontWeight`/`letterSpacing`. A Regular-weight design (this one is Geist 400 at 64/44/24px) drifts on all three axes unless each heading is fully re-specified.
**Fix:** give `Heading` a per-level default type scale (h1…h6) and make weight/tracking defaults the author can override, rather than a hard-coded class.

### F5 — `Container` doesn't cap or centre by default  ⟶ P1
Catalog copy says Container "centers content at a max width," but the render is a bare `<Box s={s}>` with no `maxWidth`/centering ([config.tsx:520](../../inertia/puck/config.tsx#L520)); centering only happens if `maxWidth` is set *and* no `margin` ([style-fields.tsx:280](../../inertia/puck/style-fields.tsx#L280)). A naïve Container is full-bleed → content-column width and side gutters drift from the 1440/64px artboard.
**Fix:** default `maxWidth: var(--container-xl)` + centered, overridable.

### F6 — `Icon` is stroke-only (no filled variant)  ⟶ P2
Curated icons stroke in `currentColor` ([config.tsx:2135](../../inertia/puck/config.tsx#L2135)); `star` renders as a gold **outline**, so review-star rows read wrong. I worked around it with a Text "★★★★★" glyph.
**Fix:** add a `filled` option (or a filled set) to the Icon block, or document the Text-glyph fallback in the catalog.

### F7 — Button/TextLink default chrome is off-design  ⟶ P2 (guidance)
`Button` always applies `rounded-md px-4 py-2 text-sm font-medium`; `TextLink` always `underline` ([config.tsx:134](../../inertia/puck/config.tsx#L134), [:162](../../inertia/puck/config.tsx#L162)). Inline styleProps override them, so it's fine *if* the author sets pill radius / padding / size / `textDecoration:none` — but the silent default is not the design. Note it in the catalog recipe (a design's CTA needs `variant:"custom"` + bg/textColor + radius/padding, and nav links need `textDecoration:"none"`).

### F8 — No artboard / absolute-frame mode  ⟶ P2 (new capability)
Position is fully supported inline (`position/top/left/zIndex`), so overlays *can* be exact — but a 1440-frame's absolute x/y don't map to a fluid page, so the converter falls back to flow layout and positions approximately. A first-class "frame" container (fixed design width, children placed by x/y/w, scales down responsively) would let a Figma/Lunacy frame convert 1:1. Higher effort; only worth it if pixel-exact conversion is a goal.

---

## The highest-leverage change: stop dropping silently

Every miss above shares a cause — the MCP **accepts** off-vocabulary props and **discards** them with a warning nobody reads. Two cheap changes fix the class of bug:

- **Alias on ingest** (F1/F2): apply the alias/longhand map before validation so intuitive names just work.
- **Surface what was dropped**: return a compact top-level `droppedProps: [{path, key, appliedAlias?}]` on `create_page`/`set_page_content`/`patch_page_content` (not buried in the echoed tree), and/or a `strict:true` mode that 422s on an unknown style key. Had the drops been visible, this build would have self-corrected the margins/aligns immediately.

## Header/footer templates

Chrome renders the template doc **bare** via `<Render config={puckConfig} data={doc}/>` with no wrapper ([chrome_slot.tsx:53](../../inertia/puck/chrome_slot.tsx#L53)) — so misalignment isn't the chrome, it's authoring + F3/F4: `justify-content:space-between` spread logo|links|CTA instead of the design's grouped-centre nav, the caret is a text glyph, the cropped logo carries a faint tint, and the translucent-over-hero look relied on the `margin:-81px` hack (which itself needs F1). Recommend: (a) a documented header recipe with the exact flex structure; (b) an optional first-class **overlay/transparent header** flag so header-over-hero doesn't need a negative-margin hack.

## Priority

- **P0 (small, localized, kills most drift):** F1, F2, F3 + the `droppedProps` summary. Touches `style-fields.tsx` + `puck_content_validator.ts`; guarded by `tests/functional/mcp_style_vocabulary.spec.ts`.
- **P1:** F4, F5, `strict` mode.
- **P2:** F6, F7 guidance, F8 artboard mode, overlay-header flag.

All P0/P1 items are backward-compatible (additive reads / new defaults only affect blocks that don't set the value).
