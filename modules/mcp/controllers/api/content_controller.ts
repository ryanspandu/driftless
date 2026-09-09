import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import ContentService from '#services/content_service'
import ContentCategoryService from '#services/content_category_service'
import ContentTagService from '#services/content_tag_service'

const content = new ContentService()
const categories = new ContentCategoryService()
const tags = new ContentTagService()

/**
 * Builder-API surface for Content posts (blog/news) and their categories & tags.
 *
 * Content is a first-class CORE entity — NOT a CMS dynamic collection and NOT a
 * product — so it gets its own MCP controller (there is no MCP `record` path
 * that reaches it). Thin over `ContentService` / `ContentCategoryService` /
 * `ContentTagService`, which are the validation authority (slug uniqueness,
 * visibility normalisation, the PROTECTED-needs-password rule, HTML sanitising).
 *
 * Gated by `content` (RBAC) ∩ `builder:read` / `builder:content` (token) at the
 * route layer — mirroring how products use `builder:read` / `builder:products`.
 */
export default class BuilderContentController {
  // ── Posts ──────────────────────────────────────────────────────────────────

  async index({ response }: HttpContext) {
    return response.json(await content.findAll())
  }

  async show({ params, response }: HttpContext) {
    try {
      return response.json(await content.findOne(params.id))
    } catch (e) {
      return response.status(404).json({ message: (e as Error).message })
    }
  }

  async store({ request, auth, response }: HttpContext) {
    const body = request.only([
      'title',
      'slug',
      'body',
      'status',
      'visibility',
      'password',
      'featuredImage',
      'data',
      'categoryIds',
      'tagIds',
    ]) as Parameters<ContentService['create']>[1]
    try {
      const item = await content.create((auth.user as User).id, {
        ...body,
        status: body.status ?? 'DRAFT',
      })
      return response.status(201).json(item)
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async update({ params, request, response }: HttpContext) {
    const body = request.only([
      'title',
      'slug',
      'body',
      'status',
      'visibility',
      'password',
      'featuredImage',
      'data',
      'categoryIds',
      'tagIds',
    ]) as Parameters<ContentService['update']>[1]
    try {
      return response.json(await content.update(params.id, body))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      await content.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  // ── Categories ───────────────────────────────────────────────────────────────

  async indexCategories({ response }: HttpContext) {
    return response.json(await categories.list())
  }

  async storeCategory({ request, response }: HttpContext) {
    const body = request.only(['name', 'slug', 'description', 'parentId'])
    try {
      return response.status(201).json(await categories.create(body))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async updateCategory({ params, request, response }: HttpContext) {
    const body = request.only(['name', 'slug', 'description', 'parentId'])
    try {
      return response.json(await categories.update(params.id, body))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroyCategory({ params, response }: HttpContext) {
    try {
      await categories.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────

  async indexTags({ response }: HttpContext) {
    return response.json(await tags.list())
  }

  async storeTag({ request, response }: HttpContext) {
    const body = request.only(['name', 'slug', 'description'])
    try {
      return response.status(201).json(await tags.create(body))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async updateTag({ params, request, response }: HttpContext) {
    const body = request.only(['name', 'slug', 'description'])
    try {
      return response.json(await tags.update(params.id, body))
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }

  async destroyTag({ params, response }: HttpContext) {
    try {
      await tags.remove(params.id)
      return response.json({ success: true })
    } catch (e) {
      return response.status(422).json({ message: (e as Error).message })
    }
  }
}
