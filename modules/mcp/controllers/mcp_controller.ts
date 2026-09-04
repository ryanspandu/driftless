import type { HttpContext } from '@adonisjs/core/http'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import { renderPage } from '#helpers/inertia_render'
import User from '#models/user'
import vine from '@vinejs/vine'
import { listAudit } from '#modules/mcp/services/mcp_audit'

/**
 * The token/scope subset this admin page mints and shows. Keeping the MCP page
 * to these avoids it becoming a general-purpose PAT minter — those live in
 * Settings → API tokens.
 */
export const MCP_ABILITIES = [
  '*',
  'builder:read',
  'builder:collections',
  'builder:pages',
  'builder:templates',
  'builder:settings',
  'builder:media',
  'cms:read',
  'cms:write',
] as const

function isMcpToken(abilities: string[]): boolean {
  return abilities.some(
    (a) => a === '*' || a.startsWith('builder:') || a === 'cms:read' || a === 'cms:write'
  )
}

const createTokenValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1),
    abilities: vine.array(vine.string()).optional(),
    expiresIn: vine.string().nullable().optional(),
  })
)

const ALLOWED = new Set<string>(MCP_ABILITIES)

/**
 * MCP admin surface: the setup + token + activity page, plus the JSON endpoints
 * it calls. Token management reuses the app's access-token store (a token
 * belongs to the user who created it); this page just scopes the UI to the
 * `builder:*` abilities and shows the builder-API audit log.
 */
export default class McpController {
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'modules/mcp/admin/index', {})
  }

  private toTokenDto(token: AccessToken) {
    return {
      id: String(token.identifier),
      name: token.name,
      abilities: token.abilities,
      lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
      createdAt: token.createdAt.toISOString(),
    }
  }

  /** List the current user's MCP-scoped access tokens. */
  async tokens({ auth, response }: HttpContext) {
    const user = auth.user! as User
    const tokens = await User.accessTokens.all(user)
    const items = tokens.filter((t) => isMcpToken(t.abilities)).map((t) => this.toTokenDto(t))
    return response.json(items)
  }

  async createToken({ auth, request, response }: HttpContext) {
    const user = auth.user! as User
    const { name, abilities, expiresIn } = await request.validateUsing(createTokenValidator)

    const invalid = (abilities ?? []).filter((a) => !ALLOWED.has(a))
    if (invalid.length > 0) {
      return response.status(422).json({
        message: `Unsupported MCP ability: ${invalid.join(', ')}. Allowed: ${MCP_ABILITIES.join(', ')}`,
      })
    }

    try {
      const effective = abilities && abilities.length > 0 ? abilities : ['builder:read']
      const token = await User.accessTokens.create(user, effective, {
        name,
        expiresIn: expiresIn || undefined,
      })
      return response.status(201).json({
        ...this.toTokenDto(token),
        token: token.value!.release(),
      })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async deleteToken({ auth, params, response }: HttpContext) {
    const user = auth.user! as User
    try {
      await User.accessTokens.delete(user, params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  /** The builder-API audit log (all tokens' activity). */
  async audit({ request, response }: HttpContext) {
    const page = request.input('page')
    const pageSize = request.input('pageSize')
    const result = await listAudit({
      page: page !== undefined ? Number(page) : undefined,
      pageSize: pageSize !== undefined ? Number(pageSize) : undefined,
    })
    return response.json(result)
  }
}
