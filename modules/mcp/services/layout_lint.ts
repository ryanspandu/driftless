/**
 * Layout lint — the deterministic, layout-aware half of the fidelity loop.
 *
 * `check_design_coverage` judges structure/palette/assets and `compare_to_reference`
 * hands the model two images to eyeball; NEITHER measures the built layout. This
 * diffs the RENDERED geometry of a page (from `probeLayout`, which reads real
 * `getBoundingClientRect` + computed styles + occlusion) against the design's
 * LAYOUT EXPECTATIONS (from `design_layout_service.toExpectations`, stored on the
 * page's brief). It turns the class of bug that shipped on Static Bloom —
 * heading not centred, header row `flex-end` instead of `flex-start`, a CTA hidden
 * behind an overlapping band, a missing "+" overlay — into concrete, id-addressed
 * issues, each carrying a ready `patch_page_content` op.
 *
 * Matching is by block id: the extractor puts the same id on the scaffold block
 * and on the expectation, so built→design is a straight lookup. Advisory only —
 * the model decides whether to apply each fix.
 */
import type { LayoutExpectation, TextAlign, Align } from '#services/design_layout_service'
import type { ProbeResult, ProbeBlock } from '#services/screenshot_service'

export type IssueKind = 'text-align' | 'cross-axis' | 'main-axis' | 'occluded' | 'missing-overlay'

export interface LayoutIssue {
  id: string
  kind: IssueKind
  expected: string
  actual: string
  message: string
  /** A ready patch_page_content op, when the fix is a single prop change; else null. */
  suggestedOp: {
    op: 'update_props' | 'update_style'
    id: string
    props: Record<string, unknown>
  } | null
}

export interface LintInput {
  probe: ProbeResult
  expects: Record<string, LayoutExpectation>
}

export interface LintReport {
  hasExpectations: boolean
  checked: number
  matched: number
  issues: LayoutIssue[]
  summary: string
}

/** Computed `text-align` normalised to the design vocabulary. */
function normTextAlign(v: string): TextAlign {
  const s = (v || '').toLowerCase()
  if (s === 'center') return 'center'
  if (s === 'right' || s === 'end') return 'right'
  return 'left' // left, start, justify, '' → left
}

/** Is a computed `align-items` acceptable for the expected value? */
function crossAxisOk(expected: Align, actual: string): boolean {
  const a = (actual || '').toLowerCase()
  if (expected === 'flex-start')
    return a === 'flex-start' || a === 'start' || a === 'normal' || a === 'stretch'
  if (expected === 'center') return a === 'center'
  if (expected === 'flex-end') return a === 'flex-end' || a === 'end'
  if (expected === 'stretch') return a === 'stretch' || a === 'normal'
  return true
}

function mainAxisOk(expected: string, actual: string): boolean {
  const a = (actual || '').toLowerCase()
  const norm = a === 'normal' ? 'flex-start' : a
  if (expected === 'flex-start') return norm === 'flex-start' || norm === 'start'
  if (expected === 'center') return norm === 'center'
  if (expected === 'flex-end') return norm === 'flex-end' || norm === 'end'
  if (expected === 'space-between') return norm === 'space-between'
  return true
}

export function lintLayout(input: LintInput): LintReport {
  const { probe, expects } = input
  const expIds = Object.keys(expects)
  if (!expIds.length) {
    return {
      hasExpectations: false,
      checked: 0,
      matched: 0,
      issues: [],
      summary:
        'No design layout expectations on this page. Run analyze_layout on the design frame first (it stores expectations on the brief) so the built layout can be graded against it.',
    }
  }

  const byId = new Map<string, ProbeBlock>()
  for (const b of probe.blocks) byId.set(b.id, b)

  const issues: LayoutIssue[] = []
  let matched = 0

  for (const [id, exp] of Object.entries(expects)) {
    // Overlays are matched by presence, not geometry.
    if (exp.isOverlay) {
      if (!byId.has(id)) {
        issues.push({
          id,
          kind: 'missing-overlay',
          expected: 'present',
          actual: 'absent',
          message: `Overlay marker "${id}" from the design (on image ${exp.overlayOf ?? '?'}) is not rendered. Re-add it as a position:absolute block inside the image's relative wrapper.`,
          suggestedOp: null,
        })
      }
      continue
    }

    const got = byId.get(id)
    if (!got) continue // block wasn't built with this id (manual build) — can't grade it
    matched++

    // Occlusion — a visible block should not be painted over at its centre.
    if (got.occludedBy) {
      issues.push({
        id,
        kind: 'occluded',
        expected: 'visible',
        actual: `covered by ${got.occludedBy}`,
        message: `Block "${id}" is hidden behind "${got.occludedBy}" at its centre. Reduce the overlapping band's negative margin, add clearance, or raise this block's zIndex.`,
        suggestedOp: null,
      })
    }

    if (exp.textAlign) {
      const actual = normTextAlign(got.styles.textAlign)
      if (actual !== exp.textAlign) {
        issues.push({
          id,
          kind: 'text-align',
          expected: exp.textAlign,
          actual,
          message: `"${id}" text-align is ${actual}, design expects ${exp.textAlign}.`,
          suggestedOp: { op: 'update_props', id, props: { align: exp.textAlign } },
        })
      }
    }

    if (exp.alignItems && !crossAxisOk(exp.alignItems, got.styles.alignItems)) {
      issues.push({
        id,
        kind: 'cross-axis',
        expected: exp.alignItems,
        actual: got.styles.alignItems,
        message: `"${id}" alignItems is ${got.styles.alignItems}, design expects ${exp.alignItems} (cross-axis alignment).`,
        suggestedOp: { op: 'update_style', id, props: { alignItems: exp.alignItems } },
      })
    }

    if (exp.justifyContent && !mainAxisOk(exp.justifyContent, got.styles.justifyContent)) {
      issues.push({
        id,
        kind: 'main-axis',
        expected: exp.justifyContent,
        actual: got.styles.justifyContent,
        message: `"${id}" justifyContent is ${got.styles.justifyContent}, design expects ${exp.justifyContent}.`,
        suggestedOp: { op: 'update_style', id, props: { justifyContent: exp.justifyContent } },
      })
    }
  }

  const summary = issues.length
    ? `${issues.length} layout issue(s) across ${matched} matched block(s). Apply the suggestedOp of each with patch_page_content, then run lint_layout again.`
    : `No layout issues — ${matched} block(s) match the design's alignment/overlay expectations.`

  return { hasExpectations: true, checked: expIds.length, matched, issues, summary }
}
