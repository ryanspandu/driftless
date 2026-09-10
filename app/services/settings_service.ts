import crypto from 'node:crypto'
import env from '#start/env'
import encryption from '@adonisjs/core/services/encryption'
import WebSetting from '#models/web_setting'
import IntegrationSetting from '#models/integration_setting'
import { newUlid } from '#services/ulid_service'

const WEB_DEFAULTS: Record<string, Record<string, string>> = {
  /**
   * Identity of the **admin shell** — deliberately not the public site's name,
   * which is `site_meta.site_title`. One installation can be "Acme CMS" to its
   * operators and "Acme Store" to its visitors.
   *
   * This section was written by the settings UI but was missing here, so
   * `getMergedSections()` could not seed it and the API returned nothing for it
   * until somebody pressed Save. Its defaults lived duplicated in the frontend
   * as a result.
   */
  admin_branding: {
    project_name: 'Driftless',
    project_tagline: 'Admin panel',
    // Empty means "use the initial badge" — see `useAdminBranding`.
    logo_url: '',
  },
  auth_pages: {
    background_url: '',
    logo_url: '',
    /**
     * Builder pages that replace the built-in auth screens, by page id. Empty
     * means "use the built-in page" — and because `applyPatches` deletes a row
     * whose value is empty, clearing the picker restores the default with no
     * special case.
     */
    login_page_id: '',
    register_page_id: '',
    forgot_password_page_id: '',
    reset_password_page_id: '',
  },
  // Builder pages that replace the public error screens. Same convention.
  error_pages: {
    not_found_page_id: '',
    server_error_page_id: '',
  },
  /**
   * Builder pages that replace the built-in Content category/tag archives
   * (`/category/:slug`, `/tag/:slug`), by page id. Empty means "use the built-in
   * Inertia archive". Same empty-deletes-the-row reset convention.
   */
  content_pages: {
    category_archive_page_id: '',
    tag_archive_page_id: '',
  },
  /**
   * The builder page that renders at `/` (the front page), by page id. Empty
   * means "use the built-in static landing (`inertia/pages/home.tsx`)". Same
   * empty-deletes-the-row reset convention as the auth/error slots. The
   * `landing_enabled` app_config toggle still gates the front page on/off.
   */
  home_page: {
    front_page_id: '',
  },
  /**
   * Shared look for every outgoing email. Site-wide rather than per-email,
   * because a logo that differs between the receipt and the password reset
   * reads as one of them being forged.
   */
  email_branding: {
    logo_url: '',
    accent_color: '#4f39f6',
    footer_note: '',
  },
  site_meta: {
    site_title: 'Driftless',
    site_description: 'A modern CMS',
    favicon_url: '/logo.svg',
    // Site-wide custom <meta> tags (JSON array of SiteMetaTag), applied on every
    // public page.
    meta: '[]',
  },
  // App configuration toggles (managed from Settings → Application).
  app_config: {
    landing_enabled: '1', // '0' hides the public landing/posts (dashboard-only)
    hidden_nav: '', // comma-separated core sidebar nav titles to hide
    // JSON `{ root: [titles], "<parentTitle>": [childTitles] }` — the operator's
    // sidebar order per level. Empty `{}` keeps the built-in order.
    nav_order: '{}',
    // Public self-service signup at POST /register. Off by default: an open
    // registration endpoint that lands people in the admin area is a standing
    // liability, so an operator has to turn it on deliberately.
    registration_enabled: '0',
  },
  // Site-wide custom code (CSS/JS) injected on every published builder page.
  // `snippets` is a JSON array of GlobalCodeSnippet.
  page_code: {
    snippets: '[]',
  },

  /** Builder-form (contact/lead) handling. */
  forms: {
    // Where submissions are also POSTed as JSON (Zapier/Make/Slack/etc). Empty = none.
    webhook_url: '',
    // Address notified of each submission (wired when email is configured). Empty = none.
    notify_email: '',
  },

  /**
   * Public theme — the default font and colour palette for the public site and
   * storefront (NOT the dashboard, which keeps its own theme). Empty means "use
   * the built-in default from app.css". A per-block Puck `font` still overrides
   * this. Values are re-sanitised at read time before they are injected as CSS.
   */
  theme: {
    font_family: '', // active font name; '' = system default
    font_css_url: '', // Google Fonts stylesheet href for the active font; '' = none
    font_face_url: '', // uploaded custom font file (same-origin); persists as an option
    font_custom_name: '', // display name of the uploaded custom font
    primary_color: '', // e.g. '#5225e6'; '' = app.css default
    secondary_color: '',
    saved_colors: '[]', // user-named colour variables (JSON [{slug,name,value}])
    design_tokens: '{}', // spacing/type/shadow/container scales (JSON, see DesignTokens); '' = app.css defaults
  },

  /**
   * Site-wide responsive breakpoints (Webflow-style). The widest tier
   * (`maxWidth: null`) is the base; narrower tiers become `@media (max-width)`
   * rules on published pages. Global so every page/template shares one design
   * system. Mirrored + re-sanitised client-side in `inertia/puck/breakpoints.ts`.
   */
  builder: {
    breakpoints:
      '[{"id":"desktop","label":"Desktop","maxWidth":null},{"id":"tablet","label":"Tablet","maxWidth":768},{"id":"mobile","label":"Mobile","maxWidth":390}]',
  },
}

/** One site-wide custom-code snippet (mirrors the builder's `CodeSnippet`). */
export interface GlobalCodeSnippet {
  id: string
  name: string
  lang: 'css' | 'js'
  code: string
  enabled: boolean
}

/** One site-wide custom `<meta>` tag. Exactly one of name/property is set. */
export interface SiteMetaTag {
  name?: string
  property?: string
  content?: string
}

function parseMetaTags(raw: string | undefined): SiteMetaTag[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v
      .map((x) => {
        const t = (x ?? {}) as Record<string, unknown>
        const out: SiteMetaTag = { content: typeof t.content === 'string' ? t.content : '' }
        if (typeof t.name === 'string' && t.name) out.name = t.name
        else if (typeof t.property === 'string' && t.property) out.property = t.property
        return out
      })
      .filter((t) => t.name || t.property)
  } catch {
    return []
  }
}

/** One site-wide responsive tier (mirrors the builder's `Breakpoint`). */
export interface ResponsiveBreakpoint {
  id: string
  label: string
  maxWidth: number | null
  custom?: boolean
}

const BREAKPOINT_MIN_WIDTH = 200
const BREAKPOINT_MAX_WIDTH = 3840
const MAX_BREAKPOINTS = 12
const BASE_BREAKPOINT_ID = 'desktop'

/** Base tier first, then by DESCENDING max-width — mirrors client orderBreakpoints. */
function orderBreakpoints(bps: ResponsiveBreakpoint[]): ResponsiveBreakpoint[] {
  return [...bps].sort((a, b) => {
    if (a.maxWidth === null) return -1
    if (b.maxWidth === null) return 1
    return b.maxWidth - a.maxWidth
  })
}

/**
 * Validate a stored/incoming breakpoint list. Clamps widths, validates ids,
 * drops duplicates/overflow, and guarantees a base tier. The client re-runs its
 * own `readBreakpoints` on render, so this is the server-side authority for what
 * gets persisted; the two must agree (guarded by a drift test).
 *
 * Kept byte-for-byte equivalent to `readBreakpoints` (inertia/puck/breakpoints.ts):
 * filter-THEN-cap (not slice-then-filter, which dropped valid tiers past index
 * 12), reserve the base id so the root tier can't be duplicated, and order the
 * result desktop-first.
 */
export function sanitizeBreakpoints(input: unknown): ResponsiveBreakpoint[] {
  const arr = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const out: ResponsiveBreakpoint[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || seen.has(id)) continue
    let maxWidth: number | null
    if (o.maxWidth === null) {
      maxWidth = null
    } else {
      const n = Number(o.maxWidth)
      if (!Number.isFinite(n)) continue
      maxWidth = Math.round(Math.max(BREAKPOINT_MIN_WIDTH, Math.min(BREAKPOINT_MAX_WIDTH, n)))
    }
    // Reserve the base id for the root (null-width) tier, so the unshift below
    // can never create two tiers sharing the base id.
    if (id === BASE_BREAKPOINT_ID && maxWidth !== null) continue
    const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 40) : id
    seen.add(id)
    out.push({ id, label, maxWidth, custom: o.custom === true })
    if (out.length >= MAX_BREAKPOINTS) break
  }
  if (!out.some((b) => b.maxWidth === null)) {
    out.unshift({ id: BASE_BREAKPOINT_ID, label: 'Desktop', maxWidth: null })
  }
  return orderBreakpoints(out)
}

function sanitizeSnippets(input: unknown): GlobalCodeSnippet[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 200).map((v) => {
    const s = (v ?? {}) as Record<string, unknown>
    return {
      id: typeof s.id === 'string' && s.id ? s.id : newUlid(),
      name: typeof s.name === 'string' ? s.name : '',
      lang: s.lang === 'js' ? 'js' : 'css',
      code: typeof s.code === 'string' ? s.code : '',
      enabled: s.enabled !== false,
    }
  })
}

/**
 * Purpose tag bound into the ciphertext. A value encrypted for one purpose
 * cannot be decrypted under another, so a ciphertext cannot be lifted from one
 * column and replayed into a different one.
 */
const SECRET_PURPOSE = 'integration_settings'

/**
 * Encrypt a third-party credential for storage in a `*_enc` column.
 *
 * Uses the app's configured encrypter (`config/encryption.ts`: AES-256-GCM,
 * keyed on `APP_KEY`, with a rotation-capable key list). The previous
 * implementation here hand-rolled AES-256-CBC with a hardcoded `'salt'` and no
 * MAC, which left ciphertext malleable and derived the same key on every
 * install sharing an `APP_KEY`.
 */
function encryptSecret(plain: string): string {
  return encryption.encrypt(plain, undefined, SECRET_PURPOSE)
}

/**
 * Legacy reader for values written by the old AES-256-CBC helper.
 *
 * Kept so an existing install keeps working across the upgrade: values are
 * re-encrypted with GCM the next time they are saved. Remove once no
 * `*_enc` column can still hold the old `<ivHex>:<cipherHex>` format.
 */
function decryptLegacySecret(enc: string): string | null {
  try {
    const [ivHex, encHex] = enc.split(':')
    if (!ivHex || !encHex) return null
    const key = crypto.scryptSync(env.get('APP_KEY').release(), 'salt', 32)
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

export function decryptSecret(enc: string): string | null {
  const current = encryption.decrypt<string>(enc, SECRET_PURPOSE)
  if (typeof current === 'string') return current
  return decryptLegacySecret(enc)
}

function maskSecret(val: string | null): string | null {
  if (!val) return null
  if (val.length <= 8) return '••••••••'
  return `${val.slice(0, 4)}${'•'.repeat(Math.min(8, val.length - 8))}${val.slice(-4)}`
}

export interface WebsiteSettingsDto {
  sections: Record<string, Record<string, string>>
  updatedAt: string
}

export interface PublicWebAppearance {
  authBackgroundUrl: string
  authLogoUrl: string
  siteTitle: string
  siteDescription: string
  faviconUrl: string
  /** Site-wide custom <meta> tags, applied on every public page. */
  metaTags: SiteMetaTag[]
}

/** The public font + colour theme, already sanitised for direct CSS injection. */
/**
 * The colours a block renders with when the operator has set no override —
 * mirrors the `--primary` / `--secondary` defaults in `inertia/css/app.css`.
 * Kept here so `getAppearance` can tell an AI client what `variant:"primary"`
 * resolves to on an unthemed site (the default purple), which is the thing that
 * makes an un-themed CTA look off-brand.
 */
export const THEME_DEFAULTS = { primary: '#5225e6', secondary: 'oklch(0.97 0 0)' } as const

/** The friendly appearance field names accepted by `setAppearanceValidated`. */
export type AppearanceField =
  | 'fontFamily'
  | 'fontCssUrl'
  | 'fontFaceUrl'
  | 'fontCustomName'
  | 'primaryColor'
  | 'secondaryColor'
  | 'savedColors'
  | 'designTokens'

export interface PublicTheme {
  fontFamily: string
  fontCssUrl: string
  /** A same-origin uploaded font file, used to build an @font-face. */
  fontFaceUrl: string
  /** The display name of the uploaded custom font (the @font-face family). */
  fontCustomName: string
  primaryColor: string
  secondaryColor: string
  /** User-named colour variables, emitted as `--color-<slug>` on public pages. */
  savedColors: SavedColor[]
  /** Spacing/type/shadow/container scales, emitted as `--space-*`/`--text-*`/… */
  designTokens: DesignTokens
}

/**
 * A CSS colour we are willing to inject: hex, a short safe keyword, or a
 * single-level CSS colour function — rgb/rgba/hsl/hsla/hwb/lab/lch/oklab/oklch/
 * color, in either comma or modern space+slash syntax. The function args are
 * restricted to a safe charset (digits, letters for `color(display-p3 …)`,
 * `.`, `%`, `/`, `,`, sign and whitespace) and, crucially, contain no inner
 * `(` — so `var(...)`, `url(...)`, `;`, `}` and quotes can never appear. That
 * keeps the value injection-safe when dropped straight into a `--primary:…`
 * declaration.
 */
const COLOR_FN =
  /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([0-9a-zA-Z.,%/\s+-]{1,80}\)$/
export function safeColor(value: string | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v
  if (COLOR_FN.test(v)) return v
  if (/^[a-zA-Z]{3,20}$/.test(v)) return v // a colour keyword like "rebeccapurple"
  return ''
}

/** A saved, named colour variable — emitted as `--color-<slug>` on public pages. */
export type SavedColor = { slug: string; name: string; value: string }

/**
 * Parse + sanitise the stored `theme.saved_colors` JSON into a trustworthy list:
 * a valid slug (`--color-<slug>` must be a safe identifier), a short display name,
 * and an injectable colour. Invalid entries and duplicate slugs are dropped — this
 * list becomes generated CSS custom properties, so it has to be clean.
 */
function sanitizeSavedColors(raw: unknown): SavedColor[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return []
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []

  const seen = new Set<string>()
  const out: SavedColor[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const slug = typeof o.slug === 'string' ? o.slug.trim().toLowerCase() : ''
    if (!/^[a-z0-9-]{1,40}$/.test(slug) || seen.has(slug)) continue
    const value = safeColor(typeof o.value === 'string' ? o.value : '')
    if (!value) continue
    const rawName = typeof o.name === 'string' ? o.name.trim().slice(0, 40) : ''
    seen.add(slug)
    out.push({ slug, name: rawName || slug, value })
    if (out.length >= 48) break
  }
  return out
}

/**
 * Design-token families we publish as CSS custom properties on public pages:
 * `space` → `--space-<slug>`, `text` → `--text-<slug>`, `shadow` → `--shadow-<slug>`,
 * `container` → `--container-<slug>`. Each family is a `{ slug: value }` map. This is
 * the spacing/type/shadow/container half of the design system; colours stay on
 * `primaryColor`/`secondaryColor`/`savedColors`. Blocks reference these with a plain
 * `var(--space-4)` string, which flows through the renderer untouched.
 */
export type DesignTokens = {
  space?: Record<string, string>
  text?: Record<string, string>
  shadow?: Record<string, string>
  container?: Record<string, string>
}

// A plain CSS <length>: a number + unit. No functions, so trivially injection-safe.
const LENGTH_UNIT = /^-?\d*\.?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|ch|pt)$/
// A clamp()/calc()/min()/max() wrapper. The charset permits letters (for units like
// `rem` and nested `calc`) but a blocklist below rejects url()/var()/expression()/etc.
const LENGTH_FN = /^(?:clamp|calc|min|max)\([0-9a-z.,%\s+\-*/()]{1,120}\)$/i
const LENGTH_FN_DENY = /url|expression|var|attr|env|image/i
/** A CSS length safe to inject into a `--space-md:…` declaration. */
export function safeLength(value: string | undefined): string {
  const v = (value ?? '').trim()
  if (!v || v.length > 128) return ''
  if (LENGTH_UNIT.test(v)) return v
  if (LENGTH_FN.test(v) && !LENGTH_FN_DENY.test(v)) return v
  return ''
}

// A box-shadow value: lengths + colours + `inset`, comma-separated. The charset
// excludes `;{}<>"'` so it can never break out of the declaration; the blocklist
// rejects the CSS functions that could smuggle in a URL/expression.
const SHADOW_VALUE = /^[0-9a-zA-Z.,%/#()\s+-]{1,200}$/
const SHADOW_DENY = /url|expression|javascript|import|var\(/i
/** A box-shadow value safe to inject into a `--shadow-md:…` declaration. */
export function safeShadow(value: string | undefined): string {
  const v = (value ?? '').trim()
  if (!v || !SHADOW_VALUE.test(v) || SHADOW_DENY.test(v)) return ''
  return v
}

// slug → sanitiser, per family. `space`/`text`/`container` are lengths; `shadow` is a
// box-shadow value. Shared by the read-time sanitiser and the write-time validator.
const DESIGN_TOKEN_FAMILIES: Array<[keyof DesignTokens, (v: string | undefined) => string]> = [
  ['space', safeLength],
  ['text', safeLength],
  ['container', safeLength],
  ['shadow', safeShadow],
]

/**
 * Parse + sanitise stored `theme.design_tokens` JSON into clean, injectable token
 * maps — each slug a safe identifier (`--<family>-<slug>`), each value passing the
 * per-family sanitiser. Invalid entries are dropped; capped at 24 per family.
 */
function sanitizeDesignTokens(raw: unknown): DesignTokens {
  let obj: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return {}
    try {
      obj = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!obj || typeof obj !== 'object') return {}
  const src = obj as Record<string, unknown>
  const out: DesignTokens = {}
  for (const [family, sanitise] of DESIGN_TOKEN_FAMILIES) {
    const map = src[family]
    if (!map || typeof map !== 'object') continue
    const clean: Record<string, string> = {}
    let n = 0
    for (const [slug, value] of Object.entries(map as Record<string, unknown>)) {
      const s = slug.trim().toLowerCase()
      if (!/^[a-z0-9-]{1,40}$/.test(s)) continue
      const val = sanitise(typeof value === 'string' ? value : '')
      if (!val) continue
      clean[s] = val
      if (++n >= 24) break
    }
    if (n) out[family] = clean
  }
  return out
}

/** A font-family name safe to drop into a CSS declaration. */
function safeFontFamily(value: string | undefined): string {
  const v = (value ?? '').trim()
  return /^[a-zA-Z0-9 _-]{1,60}$/.test(v) ? v : ''
}

/** Only a Google Fonts stylesheet href is allowed (matches the CSP allowlist). */
function safeFontUrl(value: string | undefined): string {
  const v = (value ?? '').trim()
  return /^https:\/\/fonts\.googleapis\.com\/[^\s"'<>]*$/.test(v) ? v : ''
}

/** A same-origin uploaded font file (relative path, font extension). */
function safeFontFaceUrl(value: string | undefined): string {
  const v = (value ?? '').trim()
  return /^\/[^\s"'<>]*\.(woff2?|ttf|otf)(\?[^\s"'<>]*)?$/i.test(v) ? v : ''
}

export interface IntegrationSettingsAdmin {
  googleAuthEnabled: boolean
  googleClientId: string | null
  googleClientSecretMasked: string | null
  hasGoogleClientSecretInDb: boolean
  /** A secret is stored but could not be decrypted (e.g. APP_KEY changed). */
  googleClientSecretUnreadable: boolean
  googleRedirectUriHint: string
  envGoogleOAuthFallback: boolean
  captchaEnabled: boolean
  captchaProvider: string | null
  captchaSiteKey: string | null
  captchaSecretMasked: string | null
  hasCaptchaSecretInDb: boolean
  /** A secret is stored but could not be decrypted (e.g. APP_KEY changed). */
  captchaSecretUnreadable: boolean
  captchaOnLogin: boolean
  captchaOnRegister: boolean
  captchaOnCheckout: boolean
  envCaptchaFallback: boolean
  ga4Enabled: boolean
  ga4MeasurementId: string | null
  envGa4Fallback: boolean
  clarityEnabled: boolean
  clarityProjectId: string | null
  envClarityFallback: boolean
  updatedAt: string
}

/**
 * The public (no-secret) CAPTCHA config a browser needs to render a widget and
 * know which flows require one. Shared by the admin auth pages and the
 * storefront (`GET /api/shop/config`) so the rule lives in one place.
 */
export interface PublicCaptchaConfig {
  enabled: boolean
  provider: string | null
  siteKey: string | null
  onLogin: boolean
  onRegister: boolean
  /**
   * True only when checkout CAPTCHA is enabled AND the provider is
   * invisible-capable (Turnstile). The storefront shows a checkout challenge
   * only when this is set; otherwise checkout relies on its rate limit.
   */
  onCheckout: boolean
}

export interface AuthPublicConfig {
  /** Whether public self-service signup is open. Lets the login page hide its
   * "create an account" affordance instead of linking to a 404. */
  registrationEnabled: boolean
  google: { enabled: boolean; configured: boolean }
  captcha: PublicCaptchaConfig
  analytics: {
    googleAnalytics: { enabled: boolean; measurementId: string | null }
    microsoftClarity: { enabled: boolean; projectId: string | null }
  }
  web: PublicWebAppearance
}

export class WebSettingsService {
  async getMergedSections(): Promise<Record<string, Record<string, string>>> {
    const rows = await WebSetting.query().whereNull('deleted_at')
    const sections: Record<string, Record<string, string>> = {}

    for (const [sec, defaults] of Object.entries(WEB_DEFAULTS)) {
      sections[sec] = { ...defaults }
    }

    for (const row of rows) {
      if (!sections[row.section]) sections[row.section] = {}
      sections[row.section]![row.key] = row.value
    }

    return sections
  }

  async getDto(): Promise<WebsiteSettingsDto> {
    const rows = await WebSetting.query().whereNull('deleted_at')
    const sections = await this.getMergedSections()
    const latestAt = rows.reduce<Date | null>((acc, r) => {
      const d = r.updatedAt.toJSDate()
      return !acc || d > acc ? d : acc
    }, null)
    return { sections, updatedAt: (latestAt ?? new Date(0)).toISOString() }
  }

  async getPublicAppearance(): Promise<PublicWebAppearance> {
    const sections = await this.getMergedSections()
    return this.mapPublicAppearance(sections)
  }

  mapPublicAppearance(sections: Record<string, Record<string, string>>): PublicWebAppearance {
    const auth = sections['auth_pages'] ?? WEB_DEFAULTS['auth_pages'] ?? {}
    const meta = sections['site_meta'] ?? WEB_DEFAULTS['site_meta'] ?? {}
    return {
      authBackgroundUrl: auth['background_url']?.trim() || '',
      authLogoUrl: auth['logo_url']?.trim() || '',
      siteTitle: meta['site_title']?.trim() || 'Driftless',
      siteDescription: meta['site_description']?.trim() || '',
      faviconUrl: meta['favicon_url']?.trim() || '/logo.svg',
      metaTags: parseMetaTags(meta['meta']),
    }
  }

  /** Builder-form config: submission webhook + notification email. */
  async getFormsConfig(): Promise<{ webhookUrl: string; notifyEmail: string }> {
    const sections = await this.getMergedSections()
    const f = sections['forms'] ?? WEB_DEFAULTS['forms'] ?? {}
    const url = (f['webhook_url'] ?? '').trim()
    const email = (f['notify_email'] ?? '').trim()
    return {
      webhookUrl: /^https:\/\/[^\s]+$/.test(url) ? url : '',
      notifyEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    }
  }

  /** The public theme, sanitised and ready for injection (empty = use defaults). */
  async getPublicTheme(): Promise<PublicTheme> {
    const sections = await this.getMergedSections()
    return this.mapPublicTheme(sections)
  }

  mapPublicTheme(sections: Record<string, Record<string, string>>): PublicTheme {
    const t = sections['theme'] ?? WEB_DEFAULTS['theme'] ?? {}
    return {
      fontFamily: safeFontFamily(t['font_family']),
      fontCssUrl: safeFontUrl(t['font_css_url']),
      fontFaceUrl: safeFontFaceUrl(t['font_face_url']),
      fontCustomName: safeFontFamily(t['font_custom_name']),
      primaryColor: safeColor(t['primary_color']),
      secondaryColor: safeColor(t['secondary_color']),
      savedColors: sanitizeSavedColors(t['saved_colors']),
      designTokens: sanitizeDesignTokens(t['design_tokens']),
    }
  }

  /**
   * The public theme plus the EFFECTIVE colours a block actually renders with:
   * a `primary`/`secondary` that fall back to the app.css defaults when the
   * operator has not overridden them. An AI client reads this before composing
   * so it knows what `variant:"primary"` / product CTAs will look like (and
   * whether it must call `setAppearance` to match a design's palette).
   */
  async getAppearance(): Promise<
    PublicTheme & { effective: { primary: string; secondary: string } }
  > {
    const theme = await this.getPublicTheme()
    return {
      ...theme,
      effective: {
        primary: theme.primaryColor || THEME_DEFAULTS.primary,
        secondary: theme.secondaryColor || THEME_DEFAULTS.secondary,
      },
    }
  }

  /**
   * Validate an appearance patch BEFORE storing it, then apply it. Every field
   * is optional and only touched when present; an empty string resets to the
   * default (handled by `applyPatches`). A non-empty value that would be
   * silently rejected by the read-time sanitisers (an unsupported colour format,
   * a non-Google font URL, …) is returned as an issue instead — so the caller
   * gets a 422 explaining why, rather than a 200 that leaves the site unchanged.
   * On success returns the sanitised public theme (what will actually render).
   */
  async setAppearanceValidated(
    input: Partial<Record<AppearanceField, unknown>>
  ): Promise<
    | { ok: true; theme: Awaited<ReturnType<WebSettingsService['getAppearance']>> }
    | { ok: false; issues: Array<{ field: string; message: string }> }
  > {
    const issues: Array<{ field: string; message: string }> = []
    const present = (f: AppearanceField): string | undefined =>
      input[f] === undefined ? undefined : String(input[f] ?? '')

    const checkColour = (f: AppearanceField) => {
      const v = present(f)
      if (v && !safeColor(v)) {
        issues.push({
          field: f,
          message: `${f} must be a hex colour (#3a4a3e), an rgb()/hsl()/oklch() value, or a CSS colour keyword`,
        })
      }
    }
    checkColour('primaryColor')
    checkColour('secondaryColor')

    const fontFamily = present('fontFamily')
    if (fontFamily && !safeFontFamily(fontFamily))
      issues.push({
        field: 'fontFamily',
        message: 'fontFamily may only contain letters, digits, spaces, _ and - (max 60 chars)',
      })
    const fontCssUrl = present('fontCssUrl')
    if (fontCssUrl && !safeFontUrl(fontCssUrl))
      issues.push({
        field: 'fontCssUrl',
        message: 'fontCssUrl must be a https://fonts.googleapis.com/… stylesheet href',
      })
    const fontFaceUrl = present('fontFaceUrl')
    if (fontFaceUrl && !safeFontFaceUrl(fontFaceUrl))
      issues.push({
        field: 'fontFaceUrl',
        message:
          'fontFaceUrl must be a same-origin .woff2/.woff/.ttf/.otf path (upload it with upload_media first)',
      })
    const fontCustomName = present('fontCustomName')
    if (fontCustomName && !safeFontFamily(fontCustomName))
      issues.push({
        field: 'fontCustomName',
        message: 'fontCustomName may only contain letters, digits, spaces, _ and -',
      })

    let savedColorsRaw: string | undefined
    if (input.savedColors !== undefined) {
      const arr = Array.isArray(input.savedColors) ? input.savedColors : []
      arr.forEach((item, i) => {
        const o = (item ?? {}) as Record<string, unknown>
        const slug = typeof o.slug === 'string' ? o.slug.trim().toLowerCase() : ''
        if (!/^[a-z0-9-]{1,40}$/.test(slug))
          issues.push({
            field: `savedColors[${i}].slug`,
            message: 'slug must match [a-z0-9-] (1–40 chars)',
          })
        if (typeof o.value !== 'string' || !safeColor(o.value))
          issues.push({
            field: `savedColors[${i}].value`,
            message: 'value must be a valid CSS colour',
          })
      })
      savedColorsRaw = JSON.stringify(input.savedColors ?? [])
    }

    let designTokensRaw: string | undefined
    if (input.designTokens !== undefined) {
      const dt = (input.designTokens ?? {}) as Record<string, unknown>
      for (const [family, sanitise] of DESIGN_TOKEN_FAMILIES) {
        const map = dt[family]
        if (map === undefined) continue
        if (!map || typeof map !== 'object') {
          issues.push({ field: `designTokens.${family}`, message: 'must be an object of { slug: value }' })
          continue
        }
        for (const [slug, value] of Object.entries(map as Record<string, unknown>)) {
          if (!/^[a-z0-9-]{1,40}$/.test(String(slug).trim().toLowerCase()))
            issues.push({
              field: `designTokens.${family}.${slug}`,
              message: 'slug must match [a-z0-9-] (1–40 chars)',
            })
          if (typeof value !== 'string' || !sanitise(value))
            issues.push({
              field: `designTokens.${family}.${slug}`,
              message:
                family === 'shadow'
                  ? 'value must be a valid box-shadow (lengths + colours, no url()/var())'
                  : 'value must be a CSS length: a number+unit (16px/1.5rem/80%) or clamp()/calc()',
            })
        }
      }
      designTokensRaw = JSON.stringify(input.designTokens ?? {})
    }

    if (issues.length) return { ok: false, issues }

    const map: Array<[AppearanceField, string]> = [
      ['fontFamily', 'font_family'],
      ['fontCssUrl', 'font_css_url'],
      ['fontFaceUrl', 'font_face_url'],
      ['fontCustomName', 'font_custom_name'],
      ['primaryColor', 'primary_color'],
      ['secondaryColor', 'secondary_color'],
    ]
    const patches: Array<{ section: string; key: string; value: string }> = []
    for (const [field, key] of map) {
      const v = present(field)
      if (v !== undefined) patches.push({ section: 'theme', key, value: v })
    }
    if (savedColorsRaw !== undefined)
      patches.push({ section: 'theme', key: 'saved_colors', value: savedColorsRaw })
    if (designTokensRaw !== undefined)
      patches.push({ section: 'theme', key: 'design_tokens', value: designTokensRaw })

    await this.applyPatches(patches)
    return { ok: true, theme: await this.getAppearance() }
  }

  /** Site-wide custom <meta> tags (used by the public render + appearance). */
  async getSiteMetaTags(): Promise<SiteMetaTag[]> {
    const sections = await this.getMergedSections()
    return parseMetaTags(sections['site_meta']?.['meta'])
  }

  async applyPatches(
    patches: Array<{ section: string; key: string; value: string }>
  ): Promise<WebsiteSettingsDto> {
    for (const p of patches) {
      const value = String(p.value ?? '')
      const existing = await WebSetting.query()
        .where('section', p.section)
        .where('key', p.key)
        .whereNull('deleted_at')
        .first()

      if (value === '') {
        // Empty = reset to the in-memory default; drop the override row so we
        // never persist an empty string (and re-toggling can't conflict).
        if (existing) await existing.delete()
        continue
      }

      if (existing) {
        existing.value = value
        await existing.save()
      } else {
        await WebSetting.create({
          id: newUlid(),
          section: p.section,
          key: p.key,
          value,
        })
      }
    }
    return this.getDto()
  }

  /** Site-wide custom CSS/JS snippets injected on every published page. */
  async getGlobalCode(): Promise<GlobalCodeSnippet[]> {
    const sections = await this.getMergedSections()
    const raw = sections['page_code']?.['snippets'] ?? '[]'
    try {
      return sanitizeSnippets(JSON.parse(raw))
    } catch {
      return []
    }
  }

  /** Replace the site-wide snippets (sanitized). Returns the stored result. */
  async setGlobalCode(snippets: unknown): Promise<GlobalCodeSnippet[]> {
    const clean = sanitizeSnippets(snippets)
    await this.applyPatches([
      { section: 'page_code', key: 'snippets', value: JSON.stringify(clean) },
    ])
    return clean
  }

  /** The raw site-wide breakpoints JSON string (client parses + re-sanitises). */
  async getBreakpointsRaw(): Promise<string> {
    const sections = await this.getMergedSections()
    return sections['builder']?.['breakpoints'] ?? WEB_DEFAULTS['builder']['breakpoints']
  }

  /** The site-wide breakpoints, parsed + sanitised. */
  async getBreakpoints(): Promise<ResponsiveBreakpoint[]> {
    try {
      return sanitizeBreakpoints(JSON.parse(await this.getBreakpointsRaw()))
    } catch {
      return sanitizeBreakpoints(null)
    }
  }

  /**
   * Replace the site-wide breakpoints (sanitised). Callers must follow with
   * `pagesService.invalidateAllSnapshots()` — the list changes the `@media` CSS
   * baked into every SSG page.
   */
  async setBreakpoints(input: unknown): Promise<ResponsiveBreakpoint[]> {
    const clean = sanitizeBreakpoints(input)
    await this.applyPatches([
      { section: 'builder', key: 'breakpoints', value: JSON.stringify(clean) },
    ])
    return clean
  }

  /** App-level toggles (landing on/off + hidden/ordered sidebar nav) for any admin. */
  async getAppConfig(): Promise<{
    landingEnabled: boolean
    hiddenNav: string[]
    navOrder: Record<string, string[]>
    registrationEnabled: boolean
  }> {
    const sections = await this.getMergedSections()
    const cfg = sections['app_config'] ?? {}
    return {
      landingEnabled: (cfg['landing_enabled'] ?? '1') !== '0',
      hiddenNav: (cfg['hidden_nav'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      navOrder: parseNavOrder(cfg['nav_order']),
      // Defaults to off — see `WEB_DEFAULTS.app_config.registration_enabled`.
      registrationEnabled: (cfg['registration_enabled'] ?? '0') === '1',
    }
  }
}

/** Parse the `nav_order` JSON into a per-level `{ key: [orderedKeys] }` map. */
function parseNavOrder(raw: string | undefined): Record<string, string[]> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out[key] = value.filter((v): v is string => typeof v === 'string')
      }
    }
    return out
  } catch {
    return {}
  }
}

export class IntegrationSettingsService {
  async getOrCreate(): Promise<IntegrationSetting> {
    const existing = await IntegrationSetting.find('default')
    if (existing) return existing
    return IntegrationSetting.create({ id: 'default' })
  }

  buildGoogleRedirectUri(): string {
    const port = env.get('PORT', 3333)
    const base = env.get('APP_URL', `http://localhost:${port}`)
    return `${base}/auth/google/callback`
  }

  async resolveGoogleOAuth(): Promise<{
    clientId: string
    clientSecret: string
    redirectUri: string
  } | null> {
    const row = await this.getOrCreate()
    if (!row.googleAuthEnabled) return null

    const clientId = row.googleClientId?.trim() || env.get('GOOGLE_CLIENT_ID', '')
    let clientSecret: string | null = null
    if (row.googleClientSecretEnc) {
      clientSecret = decryptSecret(row.googleClientSecretEnc)
    }
    if (!clientSecret) {
      clientSecret = env.get('GOOGLE_CLIENT_SECRET', '') || null
    }
    if (!clientId || !clientSecret) return null
    return { clientId, clientSecret, redirectUri: this.buildGoogleRedirectUri() }
  }

  /**
   * The public (no-secret) CAPTCHA config, from the stored row (with the
   * Turnstile env-key fallback the resolver honours). Single source of truth
   * for both the admin auth pages and the storefront.
   */
  buildPublicCaptchaConfig(row: IntegrationSetting): PublicCaptchaConfig {
    const captchaOk =
      row.captchaEnabled && !!(row.captchaSiteKey || env.get('TURNSTILE_SITE_KEY', ''))
    const siteKey = captchaOk ? row.captchaSiteKey || env.get('TURNSTILE_SITE_KEY', '') : null
    const provider = captchaOk ? row.captchaProvider || 'turnstile' : null
    // Invisible-capable == Turnstile (mirrors CaptchaService.isInvisibleCapable);
    // checkout only shows a challenge for an invisible provider.
    const invisible = provider === 'turnstile'

    return {
      enabled: captchaOk,
      provider,
      siteKey,
      onLogin: captchaOk && row.captchaOnLogin,
      onRegister: captchaOk && row.captchaOnRegister,
      onCheckout: captchaOk && row.captchaOnCheckout && invisible,
    }
  }

  /** The public CAPTCHA config for the current settings row. */
  async getPublicCaptchaConfig(): Promise<PublicCaptchaConfig> {
    return this.buildPublicCaptchaConfig(await this.getOrCreate())
  }

  async getAuthPublicConfig(): Promise<AuthPublicConfig> {
    const row = await this.getOrCreate()
    const google = await this.resolveGoogleOAuth()

    const webSvc = new WebSettingsService()
    const web = await webSvc.getPublicAppearance()
    const appConfig = await webSvc.getAppConfig()

    return {
      registrationEnabled: appConfig.registrationEnabled,
      google: { enabled: !!google, configured: !!google },
      captcha: this.buildPublicCaptchaConfig(row),
      analytics: {
        googleAnalytics: {
          enabled: row.ga4Enabled && !!(row.ga4MeasurementId || env.get('GA4_MEASUREMENT_ID', '')),
          measurementId: row.ga4Enabled
            ? row.ga4MeasurementId || env.get('GA4_MEASUREMENT_ID', '') || null
            : null,
        },
        microsoftClarity: {
          enabled:
            row.clarityEnabled && !!(row.clarityProjectId || env.get('CLARITY_PROJECT_ID', '')),
          projectId: row.clarityEnabled
            ? row.clarityProjectId || env.get('CLARITY_PROJECT_ID', '') || null
            : null,
        },
      },
      web,
    }
  }

  async getAdminSettings(): Promise<IntegrationSettingsAdmin> {
    const row = await this.getOrCreate()
    const googleSecretPlain = row.googleClientSecretEnc
      ? decryptSecret(row.googleClientSecretEnc)
      : null
    const captchaSecretPlain = row.captchaSecretEnc ? decryptSecret(row.captchaSecretEnc) : null

    return {
      googleAuthEnabled: row.googleAuthEnabled,
      googleClientId: row.googleClientId,
      googleClientSecretMasked: maskSecret(googleSecretPlain),
      hasGoogleClientSecretInDb: !!googleSecretPlain,
      // Distinguish "no secret set" from "a secret is stored but undecryptable"
      // so the operator knows to re-enter it rather than assuming it is empty.
      googleClientSecretUnreadable: !!row.googleClientSecretEnc && !googleSecretPlain,
      googleRedirectUriHint: this.buildGoogleRedirectUri(),
      envGoogleOAuthFallback: !!(
        env.get('GOOGLE_CLIENT_ID', '') && env.get('GOOGLE_CLIENT_SECRET', '')
      ),
      captchaEnabled: row.captchaEnabled,
      captchaProvider: row.captchaProvider,
      captchaSiteKey: row.captchaSiteKey,
      captchaSecretMasked: maskSecret(captchaSecretPlain),
      hasCaptchaSecretInDb: !!captchaSecretPlain,
      captchaSecretUnreadable: !!row.captchaSecretEnc && !captchaSecretPlain,
      captchaOnLogin: row.captchaOnLogin,
      captchaOnRegister: row.captchaOnRegister,
      captchaOnCheckout: row.captchaOnCheckout,
      // Only the Turnstile env key is actually consumed by the public captcha
      // resolver (getAuthPublicConfig), so an HCAPTCHA_SITE_KEY env alone must
      // NOT report captcha as configured — that made the integrations hub show
      // "On" while the server treated captcha as off.
      envCaptchaFallback: !!env.get('TURNSTILE_SITE_KEY', ''),
      ga4Enabled: row.ga4Enabled,
      ga4MeasurementId: row.ga4MeasurementId,
      envGa4Fallback: !!env.get('GA4_MEASUREMENT_ID', ''),
      clarityEnabled: row.clarityEnabled,
      clarityProjectId: row.clarityProjectId,
      envClarityFallback: !!env.get('CLARITY_PROJECT_ID', ''),
      updatedAt: row.updatedAt.toISO()!,
    }
  }

  async update(
    dto: Partial<{
      googleAuthEnabled: boolean
      googleClientId: string | null
      googleClientSecret: string | null
      captchaEnabled: boolean
      captchaProvider: string | null
      captchaSiteKey: string | null
      captchaSecret: string | null
      captchaOnLogin: boolean
      captchaOnRegister: boolean
      captchaOnCheckout: boolean
      ga4Enabled: boolean
      ga4MeasurementId: string | null
      clarityEnabled: boolean
      clarityProjectId: string | null
    }>
  ): Promise<IntegrationSettingsAdmin> {
    const row = await this.getOrCreate()

    if (dto.googleAuthEnabled !== undefined) row.googleAuthEnabled = dto.googleAuthEnabled
    if (dto.googleClientId !== undefined) row.googleClientId = dto.googleClientId?.trim() || null
    if (dto.googleClientSecret !== undefined) {
      row.googleClientSecretEnc = dto.googleClientSecret?.trim()
        ? encryptSecret(dto.googleClientSecret.trim())
        : null
    }
    if (dto.captchaEnabled !== undefined) row.captchaEnabled = dto.captchaEnabled
    if (dto.captchaProvider !== undefined) row.captchaProvider = dto.captchaProvider?.trim() || null
    if (dto.captchaSiteKey !== undefined) row.captchaSiteKey = dto.captchaSiteKey?.trim() || null
    if (dto.captchaSecret !== undefined) {
      row.captchaSecretEnc = dto.captchaSecret?.trim()
        ? encryptSecret(dto.captchaSecret.trim())
        : null
    }
    if (dto.captchaOnLogin !== undefined) row.captchaOnLogin = dto.captchaOnLogin
    if (dto.captchaOnRegister !== undefined) row.captchaOnRegister = dto.captchaOnRegister
    if (dto.captchaOnCheckout !== undefined) row.captchaOnCheckout = dto.captchaOnCheckout
    if (dto.ga4Enabled !== undefined) row.ga4Enabled = dto.ga4Enabled
    if (dto.ga4MeasurementId !== undefined)
      row.ga4MeasurementId = dto.ga4MeasurementId?.trim() || null
    if (dto.clarityEnabled !== undefined) row.clarityEnabled = dto.clarityEnabled
    if (dto.clarityProjectId !== undefined)
      row.clarityProjectId = dto.clarityProjectId?.trim() || null

    await row.save()
    return this.getAdminSettings()
  }
}
