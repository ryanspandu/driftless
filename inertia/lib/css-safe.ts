/**
 * Client-side mirrors of the server's CSS sanitizers (`app/services/settings_service.ts`).
 *
 * The admin builder injects the operator's theme (colours + custom font) into
 * live `<style>` tags so the canvas previews the real site. Those values are
 * operator-supplied and reach `dangerouslySetInnerHTML` / raw `@font-face` text,
 * so — exactly like the public render path — they must be sanitised before they
 * land in a stylesheet, or a stray `}` / quote could break out of the rule.
 *
 * The server stays the security boundary for what actually ships; these keep the
 * ADMIN document from injecting the same unsafe CSS into its own page.
 */

/** A CSS colour we are willing to inject: hex, rgb()/rgba(), or a short keyword. */
export function safeColor(value: string | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/.test(v))
    return v
  if (/^[a-zA-Z]{3,20}$/.test(v)) return v // a colour keyword like "rebeccapurple"
  return ''
}

/** A font-family display name safe to drop between quotes in a rule. */
export function safeFontFamily(value: string | undefined): string {
  const v = (value ?? '').trim()
  return /^[a-zA-Z0-9 _-]{1,60}$/.test(v) ? v : ''
}

/** A same-origin uploaded font file (relative path, font extension). */
export function safeFontFaceUrl(value: string | undefined): string {
  const v = (value ?? '').trim()
  return /^\/[^\s"'<>]*\.(woff2?|ttf|otf)(\?[^\s"'<>]*)?$/i.test(v) ? v : ''
}
