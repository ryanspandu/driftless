import type { HttpContext } from '@adonisjs/core/http'
import type { AccessToken } from '@adonisjs/auth/access_tokens'
import User from '#models/user'
import vine from '@vinejs/vine'

const createTokenValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(1),
    abilities: vine.array(vine.string()).optional(),
    expiresIn: vine.string().nullable().optional(),
  })
)

/**
 * Admin-only management for Personal Access Tokens (PAT) used by the
 * external token-authenticated API (`/api/v1`). A token belongs to the
 * user who created it. Plaintext is shown exactly once on creation.
 */
export default class ApiTokensController {
  /**
   * Maps an AccessToken to the safe DTO returned by the API.
   * Never includes the plaintext token value.
   */
  private toDto(token: AccessToken) {
    return {
      id: String(token.identifier),
      name: token.name,
      abilities: token.abilities,
      lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
      expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
      createdAt: token.createdAt.toISOString(),
    }
  }

  async index({ auth, response }: HttpContext) {
    const user = auth.user! as User
    const tokens = await User.accessTokens.all(user)
    const items = tokens.map((token) => this.toDto(token))
    return response.json(items)
  }

  async store({ auth, request, response }: HttpContext) {
    const user = auth.user! as User
    const { name, abilities, expiresIn } = await request.validateUsing(createTokenValidator)

    try {
      const effectiveAbilities = abilities && abilities.length > 0 ? abilities : ['*']
      const token = await User.accessTokens.create(user, effectiveAbilities, {
        name,
        expiresIn: expiresIn || undefined,
      })

      return response.status(201).json({
        ...this.toDto(token),
        token: token.value!.release(),
      })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.user! as User
    try {
      await User.accessTokens.delete(user, params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
