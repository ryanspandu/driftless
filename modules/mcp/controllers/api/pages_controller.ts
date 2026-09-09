import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import PagesService from '#services/pages_service'
import { WebSettingsService } from '#services/settings_service'
import {
  validatePuckDocument,
  type ValidationResult,
} from '#modules/mcp/services/puck_content_validator'
import { applyPatchOps, type PatchOp } from '#modules/mcp/services/puck_patch'
import { generateResponsive } from '#modules/mcp/services/auto_responsive'
import { checkDesignCoverage } from '#modules/mcp/services/design_coverage'
import { appUrl } from '#config/app'
import { abilityAllowsCode, collectUserPermissions } from '#services/permission_ability_service'
import { hasPrivilegedPageContent } from '#services/html_sanitizer_service'
import { CUSTOM_TEMPLATES } from '#services/custom_templates.generated'
import TemplateKitsService from '#services/template_kits_service'

const pages = new PagesService()
const templateKits = new TemplateKitsService()

/**
 * If `component` points at a single-template kit (`kit:<id>`), return that kit id
 * — otherwise null. Mirrors the admin page controller's `kitOfComponent`, but
 * only for the `kit:<id>` form MCP advertises (bare code-page slugs belong to no
 * kit and are validated by `PagesService.assertComponent`).
 */
function kitOfComponent(component: unknown): string | null {
  if (typeof component !== 'string') return null
  const m = component.match(/^kit:([a-z0-9][a-z0-9-]*)$/)
  return m ? m[1] : null
}

/**
 * Reject a page pointed at an INACTIVE custom-template kit, matching the admin
 * picker (which only offers active kits). `PagesService.assertComponent` accepts
 * any installed kit regardless of active state, and MCP has no human picker in
 * the loop, so this is the only place that stops an AI from building a page on a
 * kit the operator has hidden. Returns an error message, or null when allowed.
 */
async function inactiveKitError(component: unknown): Promise<string | null> {
  const kit = kitOfComponent(component)
  if (!kit) return null
  const active = await templateKits.activeSet()
  if (active.has(kit)) return null
  return `Custom template kit "${kit}" is not active — activate it in the admin before building a page on it, or call list_custom_templates for the kits you may use.`
}

/**
 * Gate executable page content on the MCP surface, exactly as the admin
 * controller does (`PagesController.canManageExecutableContent`).
 *
 * A CODE page (single-file component or `kit:<id>` custom template) or content
 * carrying code snippets runs with full app privilege, so writing it needs the
 * `settings:manage`-backed code ability — not merely the `builder:pages` token
 * ability every page write has. Without this check, a token scoped only to build
 * pages could point one at arbitrary code and publish it. `currentKind` covers
 * editing a page that is already CODE without re-sending `kind`.
 */
async function mayManageExecutable(
  user: User,
  body: { kind?: unknown; content?: unknown },
  currentKind?: string
): Promise<boolean> {
  if ((body.kind ?? currentKind) !== 'CODE' && !hasPrivilegedPageContent(body.content)) return true
  await user.load('roles', (q) => q.preload('permissions'))
  return abilityAllowsCode(collectUserPermissions(user), 'settings:manage')
}

const EXECUTABLE_DENIED =
  'settings:manage is required for executable page content (CODE pages / custom templates)'

/**
 * Auto-add mobile/tablet responsive overrides to a just-validated document,
 * unless the caller opted out with `autoResponsive: false`. Mutates the doc in
 * place (it is the normalized copy about to be saved) and returns a small report
 * to echo, or undefined when skipped/no-op.
 */
function autoResponsive(
  content: unknown,
  flag: unknown
): { responsiveAdded: number } | undefined {
  if (flag === false || content == null) return undefined
  const { touched } = generateResponsive(content)
  return touched ? { responsiveAdded: touched } : undefined
}

/**
 * Trim a preview HTML page down to what a model needs to verify structure:
 * drop `<script>` hydration bundles and inline data, and cap the length so a big
 * page stays a reasonable tool result.
 */
function trimHtmlForModel(html: string, cap = 60_000): string {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return stripped.length > cap ? stripped.slice(0, cap) + '\n<!-- …truncated… -->' : stripped
}

/**
 * Attach the validator's non-blocking advisories to a write response so the AI
 * learns what to fix (warnings) and what normalization silently changed (changes)
 * — without them, a filled id / moved slot / off-brand image is invisible. Kept
 * flat: the entity's own fields stay top-level so existing clients still read
 * `.id`/`.status`; `warnings`/`changes` are added only when non-empty.
 */
function withAdvisories<T extends object>(
  entity: T,
  check?: ValidationResult,
  extra?: Record<string, unknown>
): T {
  const out: Record<string, unknown> = {}
  if (check?.warnings.length) out.warnings = check.warnings
  if (check?.changes.length) out.changes = check.changes
  if (extra) Object.assign(out, extra)
  return Object.keys(out).length ? ({ ...entity, ...out } as T) : entity
}

/**
 * Builder-API surface for pages. Thin over `PagesService`, with one addition
 * the service does not do on its own: structural validation of the Puck
 * `content` against the block catalog (422 on unknown block types / malformed
 * slots). The service still owns path uniqueness, sanitisation, revisioning and
 * snapshot invalidation.
 */
export default class BuilderPagesController {
  async index({ response }: HttpContext) {
    return response.json(await pages.findAll())
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await pages.findOne(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /**
   * The custom-template kits under `inertia/custom/kits/`, so the AI can learn
   * valid `kit:<id>` values before creating a CODE page that points at one.
   */
  async customTemplates({ response }: HttpContext) {
    // Only offer ACTIVE kits — same as the admin picker — so the AI can't build a
    // page on a kit the operator has deactivated/hidden.
    const active = await templateKits.activeSet()
    return response.json(CUSTOM_TEMPLATES.filter((t) => active.has(t.id)))
  }

  async store({ request, auth, response }: HttpContext) {
    const user = auth.user as User
    const dto = request.only([
      'title',
      'path',
      'status',
      'renderMode',
      'kind',
      'component',
      'layoutId',
      'headerTemplateId',
      'footerTemplateId',
      'hideHeader',
      'hideFooter',
      'content',
      'seo',
    ]) as Parameters<PagesService['create']>[1]

    if (!(await mayManageExecutable(user, dto))) {
      return response.status(403).json({ message: EXECUTABLE_DENIED })
    }

    const kitErr = await inactiveKitError(dto.component)
    if (kitErr) return response.status(422).json({ message: kitErr })

    let check: ValidationResult | undefined
    let resp: { responsiveAdded: number } | undefined
    if (dto.content !== undefined) {
      check = await validatePuckDocument(dto.content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      dto.content = check.normalized
      resp = autoResponsive(dto.content, request.input('autoResponsive'))
    }
    try {
      return response.status(201).json(withAdvisories(await pages.create(user.id, dto), check, resp))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.user as User
    const dto = request.only([
      'title',
      'path',
      'status',
      'renderMode',
      'kind',
      'component',
      'layoutId',
      'headerTemplateId',
      'footerTemplateId',
      'hideHeader',
      'hideFooter',
      'content',
      'seo',
      'scheduledPublishAt',
      'scheduledUnpublishAt',
    ]) as Parameters<PagesService['update']>[2]

    // The page's current kind gates editing one that is already CODE without
    // re-sending `kind`. A missing page falls through to the service's 404 below.
    let currentKind: string | undefined
    try {
      const existing = await pages.findOne(params.id)
      currentKind = existing.kind
    } catch {
      currentKind = undefined
    }
    if (!(await mayManageExecutable(user, dto, currentKind))) {
      return response.status(403).json({ message: EXECUTABLE_DENIED })
    }

    // Only guard when the caller is (re)pointing the page at a kit — leaving
    // `component` unset keeps whatever the page already has.
    if (dto.component !== undefined) {
      const kitErr = await inactiveKitError(dto.component)
      if (kitErr) return response.status(422).json({ message: kitErr })
    }

    let check: ValidationResult | undefined
    let resp: { responsiveAdded: number } | undefined
    if (dto.content !== undefined) {
      check = await validatePuckDocument(dto.content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      dto.content = check.normalized
      resp = autoResponsive(dto.content, request.input('autoResponsive'))
    }
    try {
      return response.json(withAdvisories(await pages.update(params.id, user.id, dto), check, resp))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Stage a design as the page's draft (mirrors the builder's autosave). */
  async setContent({ params, request, response }: HttpContext) {
    const content = request.input('content')
    const seo = request.input('seo')
    if (content !== undefined) {
      const check = await validatePuckDocument(content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      const resp = autoResponsive(check.normalized, request.input('autoResponsive'))
      try {
        return response.json(
          withAdvisories(
            await pages.saveDraft(params.id, { content: check.normalized, seo }),
            check,
            resp
          )
        )
      } catch (e) {
        return response.status(404).json({ message: (e as Error).message })
      }
    }
    try {
      return response.json(await pages.saveDraft(params.id, { seo }))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /** Publish: promotes the staged draft, or the explicit `content` if given. */
  async publish({ params, request, auth, response }: HttpContext) {
    const user = auth.user as User
    const content = request.input('content')
    const seo = request.input('seo')
    const dto: Parameters<PagesService['publish']>[2] = {}
    let check: ValidationResult | undefined
    let resp: { responsiveAdded: number } | undefined
    if (content !== undefined) {
      check = await validatePuckDocument(content, 'page')
      if (!check.valid)
        return response.status(422).json({ message: 'Invalid page content', issues: check.issues })
      dto.content = check.normalized
      resp = autoResponsive(dto.content, request.input('autoResponsive'))
    }
    if (seo !== undefined) dto.seo = seo
    try {
      return response.json(withAdvisories(await pages.publish(params.id, user.id, dto), check, resp))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** Validate a document without writing it — the AI's pre-flight check. */
  async validate({ request, response }: HttpContext) {
    const content = request.input('content')
    const result = await validatePuckDocument(content, 'page')
    return response.json(result)
  }

  /**
   * Mint (or reuse) the no-login preview link for a page's DRAFT, so the AI (or
   * the operator) can look at the staged build before publishing.
   */
  async previewToken({ params, response }: HttpContext) {
    try {
      const token = await pages.ensurePreviewToken(String(params.id))
      const base = (appUrl ?? '').replace(/\/+$/, '')
      return response.json({ token, url: `${base}/preview/${token}` })
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /** Store (or clear with null) the structured design brief for a page. */
  async setBrief({ params, request, response }: HttpContext) {
    const brief = request.input('brief')
    try {
      const dto = await pages.setDesignBrief(String(params.id), brief ?? null)
      return response.json({ designBrief: dto.designBrief })
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /**
   * Report where the built page drifts from its design brief — the primary
   * fidelity gate (the MCP can't see the render). Checks the DRAFT if present,
   * else the published content.
   */
  async coverage({ params, response }: HttpContext) {
    try {
      const page = await pages.findOne(String(params.id))
      const theme = await new WebSettingsService().getAppearance()
      // Stored content is a Puck doc { root, content: [...] } — inspect the array.
      const doc = (page.draftContent ?? page.content) as Record<string, unknown> | null
      const contentArr = doc && Array.isArray(doc.content) ? doc.content : []
      const report = checkDesignCoverage({
        content: contentArr,
        brief: page.designBrief,
        themeEffective: theme.effective,
      })
      return response.json(report)
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /**
   * Render the page's DRAFT to HTML so the model can LOOK at what it built (it
   * authors blind) and compare against the reference before publishing. Reuses
   * the existing no-login /preview SSR pipeline, fetched from THIS server so it
   * works in every environment; the script bundles are stripped from the result.
   */
  async render({ params, request, response }: HttpContext) {
    try {
      const token = await pages.ensurePreviewToken(String(params.id))
      const base = `${request.protocol()}://${request.host()}`
      const url = `${base}/preview/${token}`
      const res = await fetch(url, { headers: { Accept: 'text/html' } })
      const raw = await res.text()
      return response.json({
        url,
        viewport: request.input('viewport') ?? 'desktop',
        status: res.status,
        note: 'Server-rendered draft HTML (script bundles stripped). CSR-only pages render on the client, so their body may be empty here.',
        html: trimHtmlForModel(raw),
      })
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /**
   * Apply block-addressed edit operations to the DRAFT, addressing blocks by
   * their stable props.id — so a revision is a small diff instead of a blind
   * re-send of the whole tree (which is why past revisions drifted). Re-validates
   * and saves the patched draft.
   */
  async patchContent({ params, request, response }: HttpContext) {
    const ops = request.input('ops')
    if (!Array.isArray(ops) || ops.length === 0) {
      return response
        .status(422)
        .json({ message: '`ops` must be a non-empty array of patch operations' })
    }
    let page
    try {
      page = await pages.findOne(String(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
    const current = (page.draftContent ?? page.content) as unknown
    const result = applyPatchOps(current, ops as PatchOp[])
    const check = await validatePuckDocument(result.doc, 'page')
    if (!check.valid) {
      return response.status(422).json({
        message: 'Patched content is invalid — no change saved',
        issues: check.issues,
        applied: result.applied,
        opErrors: result.errors,
      })
    }
    try {
      const saved = await pages.saveDraft(String(params.id), { content: check.normalized })
      return response.json(
        withAdvisories({ ...saved, applied: result.applied, opErrors: result.errors }, check)
      )
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async discardDraft({ params, response }: HttpContext) {
    try {
      return response.json(await pages.discardDraft(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  /** Move a page to Trash (reversible soft-delete). */
  async destroy({ params, response }: HttpContext) {
    try {
      await pages.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }
}
