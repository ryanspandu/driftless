import db from '@adonisjs/lucid/services/db'
import Content from '#models/content'
import ContentCategory from '#models/content_category'
import ContentTag from '#models/content_tag'
import { sanitizeRichText } from '#services/html_sanitizer_service'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection, type ImportCtx, type SectionReport } from '../registry.js'
import { rewriteRefs } from '../rewrite_refs.js'

/**
 * The built-in Content posts (`contents`), their first-class categories
 * (`content_categories`) and the post↔category assignments (`content_category`).
 * Carries dynamic custom fields (`data`) and the native `featuredImage`.
 *
 * Ids are preserved (upsert by id); `regenerate` mints fresh ids and rewrites
 * relation ids inside `data` + the category/assignment refs through `idMap`.
 * `featuredImage` is a media URL (preserved by the media section). `authorId`
 * becomes the importing user.
 */

interface CategoryRow {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  position: number
}

async function importPosts(
  ctx: ImportCtx,
  posts: Array<Record<string, unknown>>,
  report: SectionReport
) {
  const regen = ctx.mode === 'regenerate'
  for (const row of posts) {
    const id = String(row.id ?? '')
    const targetId = regen ? newUlid() : id || newUlid()
    if (regen && id) ctx.idMap.set(id, targetId)
    const existing = regen ? null : id ? await Content.query().where('id', id).first() : null
    if (existing && ctx.conflict === 'skip') {
      report.skipped++
      continue
    }
    const status = String(row.status ?? 'DRAFT') === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    const rawVisibility = String(row.visibility ?? 'PUBLIC')
    const visibility = (
      rawVisibility === 'PROTECTED' || rawVisibility === 'MEMBER' ? rawVisibility : 'PUBLIC'
    ) as 'PUBLIC' | 'PROTECTED' | 'MEMBER'
    const rawData = (row.data ?? null) as Record<string, unknown> | null
    const values = {
      title: String(row.title ?? 'Untitled'),
      slug: String(row.slug ?? ''),
      body: sanitizeRichText(String(row.body ?? '')),
      status: status as 'DRAFT' | 'PUBLISHED',
      visibility,
      // Carried through verbatim as ciphertext; only a PROTECTED post keeps one.
      passwordEnc: visibility === 'PROTECTED' && row.passwordEnc ? String(row.passwordEnc) : null,
      data: rawData
        ? ((regen ? rewriteRefs(rawData, ctx.idMap) : rawData) as Record<string, unknown>)
        : null,
      featuredImage: (row.featuredImage as string) ?? null,
      authorId: ctx.authorId,
    }
    if (regen) {
      let candidate = values.slug
      let n = 2
      while (candidate && (await Content.query().where('slug', candidate).first())) {
        candidate = `${values.slug}-${n++}`
      }
      values.slug = candidate
    }
    try {
      if (existing) {
        existing.merge(values)
        await existing.save()
        report.updated++
      } else {
        await Content.create({ id: targetId, ...values })
        report.created++
      }
    } catch (e) {
      report.warnings.push(`content "${values.slug}": ${(e as Error).message}`)
    }
  }
}

async function importCategories(ctx: ImportCtx, cats: CategoryRow[], report: SectionReport) {
  const regen = ctx.mode === 'regenerate'
  // Pass 1: create/update every category WITHOUT a parent (avoid FK ordering).
  for (const c of cats) {
    const targetId = regen ? newUlid() : c.id
    if (regen) ctx.idMap.set(c.id, targetId)
    const existing = regen ? null : await ContentCategory.query().where('id', targetId).first()
    if (existing && ctx.conflict === 'skip') {
      report.skipped++
      continue
    }
    let slug = c.slug
    let n = 2
    // Keep the unique slug free (ignoring this same row on overwrite).
    while (
      await ContentCategory.query()
        .where('slug', slug)
        .if(existing, (q) => q.whereNot('id', existing!.id))
        .first()
    ) {
      slug = `${c.slug}-${n++}`
    }
    try {
      if (existing) {
        existing.merge({ name: c.name, slug, description: c.description, position: c.position })
        await existing.save()
      } else {
        await ContentCategory.create({
          id: targetId,
          name: c.name,
          slug,
          description: c.description ?? null,
          parentId: null,
          position: c.position ?? 0,
        })
      }
    } catch (e) {
      report.warnings.push(`category "${c.slug}": ${(e as Error).message}`)
    }
  }
  // Pass 2: wire parents now that every category exists.
  for (const c of cats) {
    if (!c.parentId) continue
    const id = regen ? ctx.idMap.get(c.id) : c.id
    const parentId = regen ? ctx.idMap.get(c.parentId) : c.parentId
    if (id && parentId) {
      await ContentCategory.query().where('id', id).update({ parent_id: parentId })
    }
  }
}

async function importAssignments(
  ctx: ImportCtx,
  assignments: Array<{ contentId: string; categoryId: string }>
) {
  const regen = ctx.mode === 'regenerate'
  for (const a of assignments) {
    const contentId = regen ? ctx.idMap.get(a.contentId) : a.contentId
    const categoryId = regen ? ctx.idMap.get(a.categoryId) : a.categoryId
    if (!contentId || !categoryId) continue
    try {
      await db
        .table('content_post_category')
        .insert({ content_id: contentId, category_id: categoryId })
    } catch {
      // Already assigned (duplicate PK) — ignore.
    }
  }
}

interface TagRow {
  id: string
  name: string
  slug: string
  description: string | null
  position: number
}

async function importTags(ctx: ImportCtx, tags: TagRow[], report: SectionReport) {
  const regen = ctx.mode === 'regenerate'
  for (const t of tags) {
    const targetId = regen ? newUlid() : t.id
    if (regen) ctx.idMap.set(t.id, targetId)
    const existing = regen ? null : await ContentTag.query().where('id', targetId).first()
    if (existing && ctx.conflict === 'skip') {
      report.skipped++
      continue
    }
    let slug = t.slug
    let n = 2
    while (
      await ContentTag.query()
        .where('slug', slug)
        .if(existing, (q) => q.whereNot('id', existing!.id))
        .first()
    ) {
      slug = `${t.slug}-${n++}`
    }
    try {
      if (existing) {
        existing.merge({ name: t.name, slug, description: t.description, position: t.position })
        await existing.save()
      } else {
        await ContentTag.create({
          id: targetId,
          name: t.name,
          slug,
          description: t.description ?? null,
          position: t.position ?? 0,
        })
      }
    } catch (e) {
      report.warnings.push(`tag "${t.slug}": ${(e as Error).message}`)
    }
  }
}

async function importTagAssignments(
  ctx: ImportCtx,
  assignments: Array<{ contentId: string; tagId: string }>
) {
  const regen = ctx.mode === 'regenerate'
  for (const a of assignments) {
    const contentId = regen ? ctx.idMap.get(a.contentId) : a.contentId
    const tagId = regen ? ctx.idMap.get(a.tagId) : a.tagId
    if (!contentId || !tagId) continue
    try {
      await db.table('content_post_tag').insert({ content_id: contentId, tag_id: tagId })
    } catch {
      // Already assigned (duplicate PK) — ignore.
    }
  }
}

export const contentSection: DataSection = {
  name: 'content',
  owner: 'core',
  order: 55,
  label: 'Content (posts + categories + tags)',
  tables: [
    'contents',
    'content_categories',
    'content_post_category',
    'content_tags',
    'content_post_tag',
  ],

  async export() {
    const rows = await Content.query().whereNull('deleted_at').orderBy('created_at', 'asc')
    const cats = await ContentCategory.query().whereNull('deleted_at').orderBy('position')
    const assignments = await db.from('content_post_category').select('content_id', 'category_id')
    const tags = await ContentTag.query().whereNull('deleted_at').orderBy('position')
    const tagAssignments = (await db
      .from('content_post_tag')
      .select('content_id', 'tag_id')) as Array<{ content_id: string; tag_id: string }>
    return {
      content: rows.map((c) => ({
        id: c.id,
        title: c.title,
        slug: c.slug,
        body: c.body,
        status: c.status,
        visibility: c.visibility,
        // Already ciphertext (AES-GCM envelope) — safe to carry in the archive.
        passwordEnc: c.passwordEnc ?? null,
        data: c.data ?? null,
        featuredImage: c.featuredImage ?? null,
      })),
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        parentId: c.parentId,
        position: c.position,
      })),
      assignments: (assignments as Array<{ content_id: string; category_id: string }>).map((a) => ({
        contentId: String(a.content_id),
        categoryId: String(a.category_id),
      })),
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        position: t.position,
      })),
      tagAssignments: tagAssignments.map((a) => ({
        contentId: String(a.content_id),
        tagId: String(a.tag_id),
      })),
    }
  },

  async import(ctx, data) {
    const report = emptyReport('content')
    const payload = (data ?? {}) as {
      content?: Array<Record<string, unknown>>
      categories?: CategoryRow[]
      assignments?: Array<{ contentId: string; categoryId: string }>
      tags?: TagRow[]
      tagAssignments?: Array<{ contentId: string; tagId: string }>
    }
    await importPosts(ctx, payload.content ?? [], report)
    await importCategories(ctx, payload.categories ?? [], report)
    await importAssignments(ctx, payload.assignments ?? [])
    await importTags(ctx, payload.tags ?? [], report)
    await importTagAssignments(ctx, payload.tagAssignments ?? [])
    return report
  },
}
