import { EMAIL_TEMPLATES, type CodeEmailTemplate } from '#services/custom_email_templates.generated'

/**
 * Code EMAIL templates — a kit's `emails/<name>.tsx` flattened to HTML at build
 * time (see `scripts/generate-custom-templates.mjs`). The pointer
 * `codetpl:<kit>/email/<name>` wires one to a mail event, the coded twin of a
 * Puck-designed EMAIL template (`Template.renderedHtml`).
 *
 * The send path reads the pre-rendered `html` here — the queue worker has no
 * React bundle, so nothing is rendered at send time; the string is only
 * substituted. This is the server-side mirror of `inertia/custom/registry.ts`,
 * which resolves the OTHER `codetpl:` pointers (chrome, collection) to React
 * components in the browser.
 */

const CODE_EMAIL_PREFIX = 'codetpl:'
const POINTER = /^codetpl:([^/]+)\/email\/(.+)$/

/** Whether a stored template ref is a code-email pointer (vs a DB template id). */
export function isCodeEmailPointer(value: string | null | undefined): boolean {
  return typeof value === 'string' && POINTER.test(value)
}

/** Whether `value` looks like any `codetpl:` pointer (used to reject non-email ones). */
export function isCodePointer(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(CODE_EMAIL_PREFIX)
}

function find(pointer: string): CodeEmailTemplate | null {
  const m = pointer.match(POINTER)
  if (!m) return null
  return EMAIL_TEMPLATES.find((t) => t.kit === m[1] && t.name === m[2]) ?? null
}

/** True when the pointer names a code email that this build actually shipped. */
export function codeEmailExists(pointer: string): boolean {
  return find(pointer) !== null
}

/**
 * The pre-rendered HTML for a code-email pointer, or null when it is not a valid
 * pointer or the build shipped no such email — null means "fall back to the
 * built-in layout", never an error, matching the DB template path.
 */
export function codeEmailHtml(pointer: string): string | null {
  return find(pointer)?.html ?? null
}

/** The pickable code emails (no HTML), for the admin wiring picker. */
export function listCodeEmailTemplates(): Array<{ kit: string; name: string }> {
  return EMAIL_TEMPLATES.map((t) => ({ kit: t.kit, name: t.name }))
}
